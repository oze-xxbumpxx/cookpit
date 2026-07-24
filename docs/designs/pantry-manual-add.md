# 設計書: pantry-manual-add（在庫の手動追加）

- ステータス: 確定（推奨デフォルトどおりユーザー確定・2026-07-24）
- レベル: L2
- 関連: `docs/designs/pantry-core.md`（Pantry 集約・DTO・S-x/D-x の正典）、
  `docs/designs/pantry-screens.md`（在庫画面の Presentation パターン。本書はこれを踏襲。
  §将来課題「保存場所の設定 UI・手動追加」を本書が実装する）、
  `docs/designs/pantry-core-contract.md`（API/DB 確定形）、`.claude/rules/presentation-layer.md`、
  改善要望バックログ（`logs/2026-07-23.md` セッション2・項目5）
- 要件入力: ユーザー改善要望「在庫画面から在庫を追加できるようにしたい」（項目5）。
  後続の項目6（買い物リストの在庫加算機能を削除）の前提でもある。

---

## 背景

現状、在庫（Stock）は買い物リスト完了フロー（`CompleteShoppingUseCase.addStocks`）経由でしか
増えない。在庫画面（`/pantry`）は「使った / 捨てた」で減らせるだけで、手動で増やす導線が無い。
`pantry-screens` では保存場所の設定 UI・手動追加を明示的に将来課題（P-3 案B）として送っていた。
本書はその手動追加を実装する。

## 目的

在庫画面から在庫を1件、手動で追加できるようにする。品目名・数量・単位を必須、保存場所・賞味期限を
任意で入力し、追加後は一覧（保存場所グループ）へ即時反映する。

## 設計判断サマリ（D-x：先例準拠で確定 / M-x：ユーザー確定済み）

| #   | 判断                                                                                              | 準拠・理由                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M-1 | **商品紐付けは自由入力のみ**（`productId=null`）。商品ピッカーは作らない                          | 買い物リストの手動追加（`add-item-form.tsx`）と同一方式で一貫。既存 Stock も productId は頻繁に null。ユーザー確定（2026-07-24）                       |
| M-2 | フォーム項目：必須＝品目名 / 数量 / 単位、任意＝保存場所 / 賞味期限。購入日はサーバー現在時刻固定 | Stock が保持する情報に合わせる。保存場所は一覧グルーピング、賞味期限はダッシュボード期限カードと連携するため任意で入力可に。ユーザー確定（2026-07-24） |
| D-1 | ドメイン層は変更しない。`Pantry.addStock(CreateStockInput)` + `Stock.create` をそのまま使う       | 「追加＝常に新規 Stock」は既存ドメインルール（pantry.ts:153）。手動追加もこれに一致。既存 Stock への加算/マージは概念として存在しない                  |
| D-2 | Application に `AddStockUseCase` を新設（`find → addStock → save → toPantryDto`）                 | `ConsumeStockUseCase`（consume-stock.use-case.ts:15-35）と同型。在庫追加専用 UseCase は未実装のため新設が必要                                          |
| D-3 | `sourceShoppingItemId=null` 固定。冪等ガードの対象外                                              | 手動追加は買い物完了由来ではない。`source_shopping_item_id` UNIQUE は null 複数を許容（S-3）                                                           |
| D-4 | 書き込みは Hono RPC（`POST /api/pantry/stocks`）。初期表示は既存の Server Component 直呼びのまま  | presentation-layer.md の使い分け（書き込み＝B: Hono RPC）。pantry-screens D-2 と同型                                                                   |
| D-5 | 成功時はレスポンスの更新後 `PantryDto` で `stocks` state を丸ごと置換                             | `handleConsume`/`handleDiscard`（pantry-client.tsx）と同型。追加された Stock も含めて再描画される                                                      |
| D-6 | フォームは展開パネル型（「在庫を追加」ボタン ↔ フォームのトグル）を本文末尾に配置                 | 買い物リストの `add-item-form.tsx` + `shopping-list-client.tsx` の `addFormOpen` パターンを移植                                                        |
| D-7 | ドメイン例外（空名・0量）は UseCase 入口で `InvalidStockOperationError`（422）にラップ            | coding-standards「エラーは UseCase 入口で」。Zod で弾く前提だが多層防御                                                                                |

## 対象範囲

- api-contract: `pantry.schema.ts` に入力スキーマ `addStockSchema` を追加。
- Application: `AddStockUseCase` / `AddStockInputDto` を新設。
- Presentation(API): `apps/web/src/server/routes/pantry.ts` に `POST /stocks` を追加。
- Presentation(UI): `pantry/_components/add-stock-form.tsx` を新設、`pantry-client.tsx` に配線。

## 対象外

- 商品ピッカー（productId 紐付け）。将来課題（M-1 の代替案）。
- 既存 Stock への加算・マージ。ドメインに概念が無い（D-1）。
- 項目6（買い物リストの在庫加算削除）本体。項目5 完了後に別タスクで着手。
- `docs/04-domain-model.md` Pantry セクションの全面同期（実装と乖離。手動追加の追記のみ行う）。
- 認証・複数ユーザー（ADR-0003/0004 継続）。

## API 設計（新規）

`POST /api/pantry/stocks`

- 入力（`addStockSchema`）:
  ```ts
  {
    displayName: string,               // min(1)
    amount: { value: number(positive), unit: unitSchema },
    storedLocation: ('fridge'|'freezer'|'pantry') | null,
    expiresAt: string(iso date) | null
  }
  ```
  `productId` / `purchasedAt` は入力に含めない（UseCase が productId=null、purchasedAt=現在時刻を設定）。
- 出力: `PantryDto`（`pantryResponseSchema`）を **201 Created** で返す。
- エラー: Zod 検証失敗 → 400。ドメイン例外 → `InvalidStockOperationError`（既存 `app.onError` で 422）。

## バックエンド設計

### Application: `AddStockUseCase`（新規）

```
execute(input: AddStockInputDto): Promise<PantryDto>
  pantry = await pantryRepository.find()
  try {
    pantry.addStock({
      productId: null,
      displayName: input.displayName,
      amount: Quantity.of(input.amount.value, input.amount.unit),
      purchasedAt: new Date(),
      expiresAt: input.expiresAt === null ? null : new Date(`${input.expiresAt}T00:00:00`),
      storedLocation: input.storedLocation,
      sourceShoppingItemId: null,
    })
  } catch (e) { throw new InvalidStockOperationError(...) }   // 空名・0量
  await pantryRepository.save(pantry)
  return toPantryDto(pantry)
```

- `expiresAt` の文字列→Date 変換は `pantry.mapper.ts` の `toLocalDateString`（ローカル日付）と往復整合する
  よう `T00:00:00`（ローカル 0 時）で構築する。
- `AddStockInputDto`: `{ displayName: string; amount: { value: number; unit: Unit }; storedLocation: StorageLocation | null; expiresAt: string | null }`。

### Domain / Infrastructure

変更なし。`Pantry.addStock` は新規 Stock を push、`DrizzlePantryRepository.save` は差分同期で新規行を
insert（既存パス）。

## フロントエンド設計

### `add-stock-form.tsx`（新規・雛形 = `add-item-form.tsx`）

- Props: `{ submitting: boolean; onAdd: (input: AddStockFormInput) => void }`。
- フィールド: 品目名（必須）/ 数量（`type=number` min0）+ 単位（`unitSchema.options` の SelectField）/
  保存場所（`storageLocationSchema.options` を `LOCATION_LABELS` でラベル化、先頭「未設定」）/
  賞味期限（`type=date` 任意）。
- `canSubmit`: 品目名 trim 非空・数量が有限で > 0・非 submitting。送信後フィールドをリセット。
- `AddStockFormInput`: `{ displayName; amount:{value,unit}; storedLocation: StorageLocation | null; expiresAt: string | null }`。

### `pantry-client.tsx`（配線）

- `addFormOpen` state を追加。本文末尾に「在庫を追加」ボタン ↔ `<AddStockForm>` のトグル
  （`shopping-list-client.tsx` の `addFormOpen` と同型）。
- `handleAddStock(input)`: `client.api.pantry.stocks.$post({ json: input })` → 成功時 `setStocks(dto.stocks)`
  - フォームを閉じる、失敗時 `errorMessage`。二重送信は `submitting` フラグで防止。

## エラー処理

| エラー                                   | 発生         | 処理                                                                 |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------- |
| Zod 400（空名・0量・不正 location/date） | POST /stocks | クライアントは通常 `canSubmit` で送信前に防ぐ。到達時 `errorMessage` |
| `InvalidStockOperationError` 422         | UseCase 入口 | 同上（多層防御）                                                     |
| ネットワーク                             | fetch catch  | 「通信エラーが発生しました。」                                       |

## テスト方針

- 契約: `pantry.schema.test.ts` に `addStockSchema` の parse 成功/失敗（空名・value0・不正 location）。
- Application: `add-stock.use-case.test.ts`（fake pantry repo）— 追加で stocks+1・productId/sourceShoppingItemId が null・
  任意項目 null 許容・空名/0量で `InvalidStockOperationError`。
- ルート: `pantry.test.ts` に 201+PantryDto（`execute` 引数検証）・入力違反 400。
- コンポーネント: `pantry-client.test.tsx` に `stocks.$post` モック追加＋「展開→入力→追加→反映」。
  `add-stock-form.test.tsx`（単体）。
- 実画面: `manual-browser-verify`（iPhone 390×844・ライト/ダーク）。

## リスク

| #   | リスク                                                             | 対策                                                                                  |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| R-1 | プロジェクト初の「在庫を増やす手動導線」。誤入力で不要在庫が増える | 取り消しは既存「捨てた」で可能。実害小                                                |
| R-2 | `expiresAt` の文字列⇔Date 往復ズレ                                 | mapper の `toLocalDateString` に合わせローカル 0 時で構築。テストで往復検証           |
| R-3 | 既存 `pantry-client.tsx` への追記による回帰                        | 追記は新規 state・新規ハンドラに限定。既存 consume/discard は不変。既存テスト緑を確認 |

## 将来課題

- 商品ピッカー（productId 紐付け）。価格履歴連携が必要になった時点で追加。
- 項目6（買い物完了→在庫加算の削除）。本手動追加が代替導線になることが前提。
