# 設計書: shopping-list-item-check

- ステータス: 確定（2026-07-24 ユーザー確定）
- レベル: L2
- 関連:
  - `docs/designs/shopping-list-screens.md`（S-3 を本設計により supersede。§移行とリリース参照）
  - `docs/designs/shopping-list-core.md`（ShoppingItem/ShoppingList 集約の元設計）
  - `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`（本設計が S-3 を覆す判断を ADR 化。
    ユーザー確定によりADR作成）
  - `docs/decisions/ADR-0006-shopping-list-generate-idempotent.md` /
    `docs/decisions/ADR-0007-shopping-list-differential-merge.md`（隣接する冪等設計の先例。
    価格記録の冪等ロジック自体は ADR ではなく `CompleteShoppingUseCase` の実装 JSDoc に記述されている
    点に注意 — §現状構成で補足）

## 背景

買い物リスト画面（`apps/web/src/app/shopping-lists/`）の品目チェックは、現状「タップ →
`PurchaseInputForm` が下に展開 → 価格・購入店舗を入力して送信 → 初めて `bought` になる」という
2 段階フローになっている。ユーザーから「アイテムをタップしたら即チェックが付く軽量な完了操作」が
求められており、あわせて次の 2 点がユーザー確認済みで確定している。

1. チェック操作は価格・店舗の記録と切り離す（チェック＝軽量フラグ、価格記録は任意・別操作）。
2. チェックは何度でも外せる（トグル可能）。

(2) は `docs/designs/shopping-list-screens.md` の **S-3**（2026-07-13 ユーザー確定済み: 「チェック解除
（bought→pending）UI・UseCase は実装しない」）に該当する。本設計はその判断を撤回する。

## 目的

- タップで即座にチェック状態（`bought`）になり、再タップで即座に外せる（`pending` に戻る）体験を実現する。
- 価格・購入店舗の記録を「チェック」から独立したオプション操作にする。
- 既存の `MarkAsBoughtUseCase` / `POST /api/shopping-lists/:id/items/:itemId/bought`
  （価格・店舗を伴う購入確定 API）を後方互換のまま残し、影響範囲を最小化する。

## 要件

| ID  | 要件                                                                                            |
| --- | ----------------------------------------------------------------------------------------------- |
| R-1 | 品目をタップすると即座に `bought`（チェック済み）になる。価格・店舗の入力は必須ではない         |
| R-2 | チェック済み品目を再タップすると即座に `pending`（未チェック）に戻る（トグル）                  |
| R-3 | 価格・購入店舗はチェックとは別の任意操作として、チェック済み品目に対してのみ記録できる          |
| R-4 | 価格未記録のまま買い物完了（`CompleteShoppingUseCase`）しても価格記録処理が正しくスキップされる |
| R-5 | 既存の `MarkAsBoughtUseCase` / `POST .../bought` の挙動・契約を変更しない（後方互換）           |
| R-6 | DB マイグレーションを追加しない（既存スキーマの nullable カラムで対応する）                     |

## 対象範囲

- Domain: `ShoppingItem` / `ShoppingList` にチェック・チェック解除の状態遷移を追加。
- Application: 新規 UseCase（品目のチェック状態を明示的にセットする）を追加。
- api-contract: 新規リクエストスキーマを追加。
- Presentation（apps/web）:
  - Hono ルートに新規エンドポイントを追加。
  - `shopping-item-row.tsx` のタップ挙動を「展開」から「即トグル」に変更。
  - 価格記録 UI（`PurchaseInputForm`）をチェック後のオプション導線に変更。
- 設計書間の整合性維持: `docs/designs/shopping-list-screens.md` S-3 を supersede する記述方針。

## 対象外

- `docs/designs/shopping-list-screens.md` で既に対象外と確定している事項はすべて本設計でも対象外の
  ままとする（変更なし）: PWA オフライン書き込みキュー（S-5）、価格比較の金額差定量表示（S-6）、
  `GET /api/shopping-lists?mealPlanId=` 相当のクエリ API。
- `markAsSkipped`（skipped ステータス）まわりの UI・API 新設。現状 Domain 実装のみで API 非公開
  （`docs/04-domain-model.md` 記載）のままとし、本設計のチェック機能はこの状態に触れない
  （チェックトグルは `pending ⇔ bought` のみを扱う）。
- 品目の数量・表示名・productId など、チェック状態以外の編集機能。
- DB マイグレーション（§DB 設計のとおり不要と判断）。
- 複数デバイス間のリアルタイム同期強化（WebSocket 等）。既存の「フォーカス時 refetch + 手動更新」
  （D-7）のままとする。

## 現状構成

### Domain（`packages/domain/src/shopping-list/shopping-list.ts`）

- `ItemStatus = 'pending' | 'bought' | 'skipped'`。
- `ShoppingItem.markAsBought(price: Money, store: StoreId): void` — 現状態を問わず `bought` へ
  上書きする（S-11a/b）。**price / store は必須引数**で、呼び出し側で null を渡せない。
- `ShoppingItem.markAsSkipped(): void` — `pending` からのみ許可。
- **`bought → pending` の逆遷移メソッドは存在しない。**
- `ShoppingList`（集約ルート）はすべて `assertActive` ガード付きの薄いラッパー
  （`markAsBought(itemId, price, store)` / `markAsSkipped(itemId)` / `reassignStore(itemId, store)`）
  - リスト全体の `complete()` / `reopen()`。品目単位の `reopen` 相当は存在しない。

### Application（`packages/application/src/shopping-list/`）

- `MarkAsBoughtUseCase`: `MarkAsBoughtInputDto { shoppingListId, itemId, actualPrice: {amount, currency},
actualStoreId }` — 全フィールド必須。list が `active` でなければ `InvalidShoppingListStateError`。
- `CompleteShoppingUseCase`: 完了時に `bought` かつ `actualPrice`/`actualStore` が揃っているアイテムのみ
  `Product.recordPrice()` を呼ぶ。**既にこの実装は `actualPrice === null || actualStore === null` の
  場合に `buildPriceRecord()` が `null` を返してスキップする分岐を持っている**
  （`complete-shopping.use-case.ts` L107-119）。つまり「`bought` だが価格未記録」という状態は
  コード上は既に安全に扱える。ただし現状の `complete-shopping.use-case.test.ts` は `actualPrice` が
  `Money.of(0, 'JPY')`（0円）のケースはテストしているが、`actualPrice === null` を明示的に検証する
  ケースはない（後述 §テスト方針で追加を提案）。
- 品目のチェック状態だけを軽量に更新する汎用 UseCase は存在しない。

### api-contract（`packages/api-contract/src/shopping-list.schema.ts`）

- `markAsBoughtSchema = { actualPrice: {amount: number.min(0), currency: 'JPY'}, actualStoreId: z.uuid() }`
  — 全フィールド必須。

### Infrastructure

- `packages/infrastructure/src/db/schema.ts`（L119-139）の `shopping_items` テーブル:
  `actualPriceAmount` / `actualStoreId` は **`.notNull()` が付いておらず既に nullable**。
  マイグレーション SQL（`apps/web/src/db/migrations/0006_previous_jamie_braddock.sql`）にも
  `status` と `actual_price_amount` を結び付ける `CHECK` 制約は存在しない。
  → **本設計はマイグレーション不要**（要件 R-6 を満たせることを確認済み）。
- `DrizzleShoppingListRepository` は `status`・`actualPriceAmount`・`actualStoreId` を素直に
  null 許容としてマッピングしている（`toEntity` / `toShoppingItemRows`）。**変更不要。**

### Hono ルート（`apps/web/src/server/routes/shopping-lists.ts`）

- `POST /api/shopping-lists/:id/items/:itemId/bought`（価格・店舗必須の購入確定 API）が既存。
- リスト単位の `/complete` `/reopen` はあるが、品目単位のチェック状態トグル API はない。

### Presentation（`apps/web/src/app/shopping-lists/_components/`）

- `shopping-item-row.tsx`: `role="checkbox"` ボタンが既にあり、コンセプト配色
  （`bg-primary text-primary-foreground border-primary` + `Check` アイコン、bought 時は取り消し線）に
  準拠済み。ただし `onClick` は `onToggleExpand(item.id)` を呼ぶだけで、**チェック自体は行わない**。
  実際に `bought` になるのは `PurchaseInputForm` の送信時のみ。
- `purchase-input-form.tsx`: `item.status === 'bought'` のとき
  「購入済みの品目です。金額・店舗は訂正できますが、**未購入には戻せません**。」という注記文言がある
  （L52-56）。**本設計によりこの文言は実態と異なる説明になるため修正が必須**（§フロントエンド設計）。
- `shopping-list-client.tsx`: `handleMarkAsBought` が `useOptimistic` + `startTransition` +
  `submittingItemId`（品目単位の二重送信防止）のパターンで実装済み。新規ハンドラもこのパターンを
  踏襲する。

### 既存の確定済み設計判断（今回覆す対象）

`docs/designs/shopping-list-screens.md` **S-3**（2026-07-13 ユーザー確定済み）:
「チェック解除（bought→pending）UI・UseCase は実装しない」。理由は「既存 API のみで完結させる
L2 の前提を超えるため」。→ 本設計により **supersede**（§移行とリリース）。

## 変更後構成

### レイヤー別の変更概要

| レイヤー       | 変更内容                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Domain         | `ShoppingItem.check()` / `uncheck()`、`ShoppingList.check(itemId)` / `uncheck(itemId)` を追加  |
| Application    | `SetItemCheckedUseCase` を新規追加。`SetItemCheckedInputDto` を追加                            |
| api-contract   | `setItemCheckedSchema` を追加                                                                  |
| Infrastructure | 変更なし                                                                                       |
| Hono ルート    | `POST /api/shopping-lists/:id/items/:itemId/checked` を追加                                    |
| Presentation   | `shopping-item-row.tsx` のタップ挙動変更、`purchase-input-form.tsx` の文言修正、他プロップ配線 |

既存の `markAsBought` / `MarkAsBoughtUseCase` / `markAsBoughtSchema` /
`POST .../bought` エンドポイントは**一切変更しない**（後方互換。§移行とリリースで詳述）。

## データフロー

### 変更後: チェックのトグル（新規）

```
[shopping-item-row.tsx] チェックボタン tap
  → onSetChecked(itemId, !bought)  ※現在の bought をそのまま反転させた「望む状態」を渡す
  → [shopping-list-client.tsx] handleSetChecked
      1. useOptimistic で即時に status を bought/pending に反映（体感遅延ゼロ）
      2. Hono RPC: POST /api/shopping-lists/:id/items/:itemId/checked { checked }
      3. [SetItemCheckedUseCase]
         - ShoppingList 取得（404 なら ShoppingListNotFoundError）
         - list.status !== 'active' なら InvalidShoppingListStateError（422）
         - item 取得（見つからなければ ShoppingItemNotFoundError（404））
         - 冪等ガード: 現在の status と input.checked が既に一致していれば
           Domain 呼び出しをスキップ（2人同時操作でも例外にならない。§バックエンド設計で詳述）
         - 一致しなければ list.check(itemId) または list.uncheck(itemId) を呼ぶ
         - save() → 更新後の ShoppingItemDto を返す
      4. レスポンスで items 配列内の該当品目を実データに置き換え（optimistic 状態を確定値で上書き）
      5. 失敗時は optimistic 状態が自動ロールバックされ、errorMessage を表示
```

### 変更後: 価格・店舗の記録（既存フローを流用、トリガのみ変更）

```
[shopping-item-row.tsx] 「金額を記録」ボタン（bought のときのみ表示）tap
  → onToggleExpand(itemId) で PurchaseInputForm を展開
  → [purchase-input-form.tsx] 価格・店舗を入力して送信
  → onMarkAsBought(itemId, price, storeId)
  → [shopping-list-client.tsx] handleMarkAsBought（既存・無変更）
  → POST /api/shopping-lists/:id/items/:itemId/bought（既存・無変更）
  → [MarkAsBoughtUseCase]（既存・無変更）
```

### 変更後: 買い物完了時の価格記録スキップ（ロジック変更なし・経路が増えるだけ）

```
[CompleteShoppingUseCase.execute]
  boughtItems = items.filter(isBought())  // status === 'bought'（価格の有無は問わない）
  → recordPrices(boughtItems, now)
      → buildPriceRecord(item, ...)
          if (actualPrice === null || actualStore === null) return null;  // 既存実装のまま
      → null が返れば product.recordPrice() を呼ばない・Product を保存しない
```

本設計により「チェックのみで価格未記録」の `bought` アイテムが増えるが、上記の `null` ガードは
**実装済み**であり分岐ロジックの変更は不要。テストケースの追加のみ必要（§テスト方針）。

## API 設計

### 新規: `POST /api/shopping-lists/:id/items/:itemId/checked`

品目のチェック状態を明示的にセットする（トグルではなく「望む状態」を送る Set 操作）。

**リクエスト**

```ts
// packages/api-contract/src/shopping-list.schema.ts に追加
export const setItemCheckedSchema = z.object({
  checked: z.boolean(),
});
export type SetItemCheckedBody = z.infer<typeof setItemCheckedSchema>;
```

- パラメータ: 既存の `shoppingItemIdParamSchema`（`id` = shoppingListId, `itemId`）を流用。

**レスポンス**

- 既存の `shoppingItemResponseSchema`（`ShoppingItemDto`）をそのまま流用。**新規レスポンス
  スキーマは不要**（`status` が `pending`/`bought` に変わるだけで、DTO の形は変わらない）。
- 200 OK。

**エラー**

| 状況                        | 例外                            | HTTP |
| --------------------------- | ------------------------------- | ---- |
| shoppingListId が存在しない | `ShoppingListNotFoundError`     | 404  |
| itemId の品目が存在しない   | `ShoppingItemNotFoundError`     | 404  |
| list が `completed`         | `InvalidShoppingListStateError` | 422  |

いずれも既存クラスを再利用し、`apps/web/src/server/app.ts` の `onError` ハンドラは**変更不要**
（3クラスとも既に登録済み）。

**設計判断: `checked: boolean` の Set 操作 vs `check`/`uncheck` の 2 エンドポイント**

| 案                                                            | 長所                                                                                                                 | 短所                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A（推奨）: `POST .../checked { checked: boolean }` 1本**    | 「望む状態」を明示的に送る Set 操作のため**冪等**。2人利用（D-7）で同時タップしても安全。UseCase 1個・ファイル数最小 | body の boolean を見ないとエンドポイントの意味が分からない（ドキュメントで補う）                                                                 |
| B: `POST .../check` と `POST .../uncheck` の 2 エンドポイント | エンドポイント名だけで意味が分かる。body 不要                                                                        | ファイル・UseCase が2倍。クライアントが「現在の状態の逆」を計算してどちらを呼ぶか決める必要があり、2人利用時に競合すると意図しない反転が起きうる |

**推奨: 案 A**。理由は、このアプリが明示的に「2人で同じリストを見て操作する」運用（D-7）を前提として
おり、素朴なトグル（現在状態を見て逆を送る）は competing writes で意図しない結果になりうるため、
「明示的に望む状態を送る」Set 操作の方が安全だから。UI 側の `onClick` は現在表示している `bought`
の否定値を送るため体験上はトグルに見えるが、サーバー側は Set として扱う。

### 既存: `POST /api/shopping-lists/:id/items/:itemId/bought`

**変更なし。** スキーマ（`markAsBoughtSchema`）・ルート・`MarkAsBoughtUseCase` すべて現状維持。
価格・店舗の記録／訂正は引き続きこのエンドポイントが担う。

## Contract

本節は `docs/claude-code/agent-responsibilities.md` の contract-designer 責務に基づき、
`packages/api-contract` への `setItemCheckedSchema` 新設について、上記「API 設計」節の内容を
正典としつつ差分・後方互換性・契約テスト観点を正式に検証・補完したものである。調査対象は
`packages/api-contract/src/shopping-list.schema.ts` / `shopping-list.schema.test.ts`、
`apps/web/src/server/app.ts`（`onError`）、`apps/web/src/server/routes/shopping-lists.ts`、
`apps/web/src/server/routes/shopping-lists.test.ts`、および呼び出し側の
`apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`。

### 1. 契約差分（Before/After）

**スキーマレベル（`packages/api-contract/src/shopping-list.schema.ts`）**

| 対象                                                                                                                                                        | 変更前     | 変更後                                                         | 種別     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- | -------- |
| `setItemCheckedSchema`                                                                                                                                      | 存在しない | `z.object({ checked: z.boolean() })` を新設                    | **追加** |
| `SetItemCheckedBody`（`z.infer<typeof setItemCheckedSchema>`）                                                                                              | 存在しない | 新設                                                           | **追加** |
| `markAsBoughtSchema` / `MarkAsBoughtBody`                                                                                                                   | 現状のまま | 変更なし                                                       | なし     |
| `shoppingItemResponseSchema` / `ShoppingItemResponse`                                                                                                       | 現状のまま | 変更なし（新規エンドポイントのレスポンスとして再利用するのみ） | なし     |
| `shoppingListResponseSchema` / `reassignStoreSchema` / `addItemSchema` / `generateShoppingListSchema` / `itemStatusSchema` / `shoppingItemIdParamSchema` 等 | 現状のまま | 変更なし                                                       | なし     |

**エンドポイントレベル（`apps/web/src/server/routes/shopping-lists.ts`）**

| 対象                                                                                                                                                          | 変更前     | 変更後                                                                                                                            | 種別     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `POST /api/shopping-lists/:id/items/:itemId/checked`                                                                                                          | 存在しない | 新規追加（body: `setItemCheckedSchema`、param: `shoppingItemIdParamSchema`、response: `shoppingItemResponseSchema`、200/404/422） | **追加** |
| `POST /api/shopping-lists/:id/items/:itemId/bought`                                                                                                           | 現状のまま | 変更なし                                                                                                                          | なし     |
| その他全ルート（`POST /`, `GET /:id`, `POST /:id/items`, `POST /:id/items/:itemId/target-store`, `POST /:id/complete`, `POST /:id/reopen`, `POST /:id/sync`） | 現状のまま | 変更なし                                                                                                                          | なし     |

**セマンティックな差分（型は変わらないが実データの意味が変わる点・要注意）**

`shoppingItemResponseSchema` 自体の型定義は変更しないが、`status: 'bought'` かつ
`actualPrice: null` / `actualStoreId: null` という組み合わせ — Zod の型としては元々許容されて
いた（`actualPrice` / `actualStoreId` は既に `.nullable()`）が、従来は `MarkAsBoughtUseCase`
経由でしか `bought` に到達できなかったため実データとしては生成されていなかった — が、本設計に
より `SetItemCheckedUseCase.check()` 経由で実際に生成されるようになる。これは **Zod スキーマ
としては後方互換だが、「`bought` ならば価格情報が伴う」という従来の暗黙のビジネス上の前提が
崩れる**という契約上の注意点である。

この点について、既存コードの null 安全性を確認した:

- `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx:93` は既に
  `{bought && item.actualPrice !== null && (...)}` という null ガード付きで実装されており、
  `bought` かつ `actualPrice === null` の状態を安全に扱える。
- `CompleteShoppingUseCase` の `buildPriceRecord()` も `actualPrice === null || actualStore === null`
  の場合に `null` を返す分岐を実装済み（`complete-shopping.use-case.ts` L107-119、設計書
  §現状構成で確認済み）。

→ 追加の防御コードは不要と判断する。ただし明示的なテストカバレッジが手薄なため、後述
§7 契約テスト方針および設計書 §テスト方針（`complete-shopping.use-case.test.ts` への
`actualPrice === null` ケース追加）でカバーする。

### 2. 後方互換性判定

**判定: 互換性を破壊しない。既存クライアント・既存データへの影響はゼロ。ユーザー確認は不要
と判断する**（フィールドの削除・型変更・既存必須フィールドの追加はいずれも発生しない）。

根拠:

1. **型レベル**: 新規スキーマ（`setItemCheckedSchema`・`SetItemCheckedBody`）の追加のみ。既存の
   6 スキーマ（`generateShoppingListSchema` / `addItemSchema` / `markAsBoughtSchema` /
   `reassignStoreSchema` / `shoppingItemResponseSchema` / `shoppingListResponseSchema`）は
   1 フィールドも変更しない。Hono RPC 経由でこれらの型を `import type` している既存のフロント
   コード（`shopping-list-client.tsx` 等）はコンパイルエラー・実行時挙動とも影響を受けない。
2. **ルートレベル**: 新規ルート `POST .../checked` の追加のみ。既存 7 ルートは無変更のため、
   既存のフロント呼び出しコード・既存の Hono ルートテスト（`shopping-lists.test.ts`）は
   一切変更を要しない。
3. **DB レベル**: マイグレーション不要（設計書 §DB 設計で確認済み）。既存データ（既に
   `bought` になっている行、`actualPriceAmount` / `actualStoreId` が非 null の行）は本変更の
   影響を受けない。
4. **セマンティックレベル**: 上記§1 のとおり、既存コードは実行時にも null 安全であることを
   確認済み。

以上より、本契約変更は**新規追加のみ（Additive change）**であり、後方互換性を破壊しない。
Orchestrator 経由でのユーザー承認確認は不要と判断する（設計書自体は既にユーザー確定済み）。

### 3. フィールド定義（必須/任意・nullability）

| フィールド | 型            | 必須/任意 | nullable | デフォルト |
| ---------- | ------------- | --------- | -------- | ---------- |
| `checked`  | `z.boolean()` | 必須      | 不可     | なし       |

**任意化しない理由**: このエンドポイントは「トグル」ではなく「望む状態を明示的に送る Set 操作」
として設計されている（§API 設計の設計判断表）。`checked` を任意（`.optional()`）にして省略時に
何らかのデフォルト挙動（例: 常に `true` 扱い）を与えると、呼び出し側が「今どちらの状態にしたいか」
を明示しなくても送信できてしまい、Set 操作としての意図（2人利用時の competing writes に対する
安全性、§API 設計参照）が崩れる。全呼び出しで目的の状態を明示させることが、UseCase 側の冪等ガード
（§5）の前提条件でもある。

**nullable にしない理由**: ドメインの `ItemStatus` は `pending` / `bought` / `skipped` の 3 値
だが、本エンドポイントが扱うのは `pending ⇔ bought` の 2 状態のみ（`skipped` は対象外。§対象外
参照）。この 2 状態に「未設定」を意味する第三の値は存在しないため、`checked` に「値なし」を
表現する必要がない。これは `productId: z.uuid().nullable()` や `targetStoreId: z.uuid().nullable()`
のような「実体として存在しないことがある」フィールドとは性質が異なる。参考として、既存の
`markAsBoughtSchema` の `actualPrice` / `actualStoreId`（リクエスト側）も同様に必須・非 nullable
であり、「Set する値そのもの」は必須・非 nullable、「エンティティ上の記録済みデータの有無」は
nullable、という本プロジェクトの契約上の一貫したパターンに沿っている（コーディング規約
`.claude/rules/coding-standards.md` の「値なしは null に統一」は、本フィールドのように値なし
状態が存在しないケースには適用対象外）。

### 4. エラー形式

既存の `apps/web/src/server/app.ts` の `onError` ハンドラをそのまま踏襲する（**変更不要**）。
3 例外クラスとも既に登録済みであることを確認した（`app.ts` L52-60）。

| HTTP | 例外クラス                      | JSON レスポンス形状   | `message` の実際の書式（`packages/application/src/shared/errors.ts` 準拠） |
| ---- | ------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| 404  | `ShoppingListNotFoundError`     | `{ "error": string }` | `ShoppingList not found: <shoppingListId>`                                 |
| 404  | `ShoppingItemNotFoundError`     | `{ "error": string }` | `ShoppingItem not found: <itemId>`                                         |
| 422  | `InvalidShoppingListStateError` | `{ "error": string }` | `Cannot setItemChecked a ShoppingList with status 'completed'`             |

新規のエラー型・新規のエラーコード体系は追加しない。既存の他エンドポイント（`/bought` /
`/target-store` / `/complete`）と全く同じ `{ "error": string }` 形状で統一されている。

### 5. 冪等性

- **HTTP レベル**: `POST` メソッドのため HTTP 仕様上は非冪等が既定だが、本エンドポイントは
  「望む状態（`checked`）を Set する」設計のため、**同じリクエストを何度送っても最終状態は
  同じになる（意味的に冪等）**。
- **Application レベル（設計の核）**: `SetItemCheckedUseCase.execute()` は、現在の
  `item.status` と `input.checked` が既に一致する場合、`ShoppingList.check()` /
  `uncheck()` の呼び出し自体をスキップする（設計書 §バックエンド設計のコード参照）。これは
  `uncheck()` が `status !== 'bought'` のとき `Error` を投げる不変条件を持つため必要な
  ガードであり、2人が同時に同じ操作を送っても例外化しないための設計である（D-7 の「2人利用」
  を踏まえた設計判断）。
- **冪等キー**: 本操作は決定的な Set 操作であり、送信のたびに新しい副作用（レコード追加等）が
  発生しないため、`Idempotency-Key` ヘッダのような明示的な冪等性キーの導入は不要と判断する
  （設計書 §エラー処理で明記済み。外部 I/O を伴わない単純な状態更新のため）。
- **契約テストの観点**: 同じ `checked` 値（例: `true`）を連続送信しても、毎回 `200 OK` かつ
  同一内容の `ShoppingItemDto`（`status: 'bought'`）が返り続けることを確認する。これは
  Zod スキーマ単体の契約ではなく Application/Route レベルの振る舞いであるため、
  `apps/web/src/server/routes/shopping-lists.test.ts` および
  `packages/application` の UseCase テストで検証する（§7 で test-designer への引き継ぎとして
  明記）。

### 6. リクエスト/レスポンスのサンプル

**例1: チェックを付ける（`pending → bought`）**

リクエスト:

```
POST /api/shopping-lists/11111111-1111-4111-8111-111111111111/items/33333333-3333-4333-8333-333333333333/checked
Content-Type: application/json

{ "checked": true }
```

レスポンス（`200 OK`。`ShoppingItemDto` = `shoppingItemResponseSchema`）:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "productId": "44444444-4444-4444-8444-444444444444",
  "displayName": "玉ねぎ",
  "requiredAmount": { "value": 2, "unit": "個" },
  "amountNote": null,
  "targetStoreId": "55555555-5555-4555-8555-555555555555",
  "status": "bought",
  "actualPrice": null,
  "actualStoreId": null,
  "source": "from_meal_plan"
}
```

`status` は `bought` になるが、`actualPrice` / `actualStoreId` は `null` のまま（§1 のセマン
ティック差分で述べたとおり、チェックのみでは価格・店舗を記録しないため）。

**例2: チェックを外す（`bought → pending`、価格記録済みだった場合）**

リクエスト:

```
POST /api/shopping-lists/11111111-1111-4111-8111-111111111111/items/33333333-3333-4333-8333-333333333333/checked
Content-Type: application/json

{ "checked": false }
```

レスポンス（`200 OK`）:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "productId": "44444444-4444-4444-8444-444444444444",
  "displayName": "玉ねぎ",
  "requiredAmount": { "value": 2, "unit": "個" },
  "amountNote": null,
  "targetStoreId": "55555555-5555-4555-8555-555555555555",
  "status": "pending",
  "actualPrice": null,
  "actualStoreId": null,
  "source": "from_meal_plan"
}
```

直前に `actualPrice` / `actualStoreId` が記録されていた場合でも `uncheck()` により
`null` にクリアされる（§バックエンド設計 `uncheck()` 仕様どおり）。

**例3: エラー（リストが `completed`）**

リクエスト: 同上のパスに `{ "checked": true }`。

レスポンス（`422 Unprocessable Entity`）:

```json
{ "error": "Cannot setItemChecked a ShoppingList with status 'completed'" }
```

**例4: エラー（品目が存在しない）**

レスポンス（`404 Not Found`）:

```json
{ "error": "ShoppingItem not found: 33333333-3333-4333-8333-333333333333" }
```

### 7. 契約テスト方針（test-designer への引き継ぎ）

以下は契約設計として推奨する具体的なテストケースであり、最終的な試験計画の確定は
test-designer に委ねる。

**`packages/api-contract/src/shopping-list.schema.test.ts`（`setItemCheckedSchema` の新規 `describe` ブロック）**

- `{ checked: true }` を受理し、パース結果が `{ checked: true }` と一致すること。
- `{ checked: false }` を受理し、パース結果が `{ checked: false }` と一致すること。
- `checked` が文字列（例: `'true'`）のとき reject する。
- `checked` が数値（例: `1` / `0`）のとき reject する。
- `checked` が `null` のとき reject する（`.nullable()` を付けていないことの回帰確認。§3）。
- `checked` キーを省略したとき reject する（`.optional()` を付けていないことの回帰確認。§3）。
- 既存の `describe('markAsBoughtSchema')` 等と同様、独立した `describe('setItemCheckedSchema')`
  ブロックとして追加し、既存テストへの影響がないことを維持する。

**`apps/web/src/server/routes/shopping-lists.test.ts`（ルートレベル・§5 冪等性の契約観点を含む）**

- `POST /api/shopping-lists/:id/items/:itemId/checked` が 200 で `ShoppingItemDto` を返す
  （既存の `/bought` `/target-store` ルートテストと同じモック注入パターンを踏襲）。
- `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` / `InvalidShoppingListStateError`
  それぞれが 404/404/422 と `{ "error": string }` を返す（`UseCase.execute` のモックが該当
  エラーを throw する形で検証。既存の他ルートの 404/422 テストと同じパターン）。
- **冪等性の契約テスト（新規観点）**: 同一の `{ checked: true }` を同じ `id`/`itemId` に対して
  連続 2 回 `app.request()` した場合、いずれも `200` かつ同一の `ShoppingItemDto` を返すこと
  （`UseCase.execute` のモックが両呼び出しで同じ結果を返すよう設定し、ルート層が例外を
  発生させないことを確認する形で足りる。実際の「状態が変わらない」ことの検証は Application
  層のテストが担う）。

**`packages/application` の UseCase テスト（`shopping-list-use-cases.test.ts`、設計書 §テスト方針で詳述済みのため契約観点のみ再掲）**

- 冪等ケース: 既に `bought` の品目に `checked: true` を送っても例外を投げず `bought` を返す
  こと、既に `pending` の品目に `checked: false` を送っても例外を投げず `pending` を返すこと
  （`ShoppingList.check`/`uncheck` が呼ばれない no-op 経路の確認）。

**回帰確認**

- `markAsBoughtSchema` / `reassignStoreSchema` / `addItemSchema` / `shoppingItemResponseSchema` /
  `shoppingListResponseSchema` の既存テストは無変更のまま全て green を維持すること
  （新規スキーマ追加によるインポート順序・共有ヘルパーへの副作用がないことの確認）。

## DB 設計

**変更なし（マイグレーション不要）。**

`packages/infrastructure/src/db/schema.ts` の `shopping_items` テーブルは調査済みで以下を確認した:

- `status: text('status').notNull()` — 値は `'pending' | 'bought' | 'skipped'` のいずれか
  （アプリケーション側でのみ enum 制約。DB 側に `CHECK` 制約はない）。
- `actualPriceAmount: numeric(...)` / `actualStoreId: text(...)` — **`.notNull()` が付いていない
  = 既に nullable**。
- 対応するマイグレーション SQL（`0006_previous_jamie_braddock.sql`）にも `status` と
  `actual_price_amount` を関連付ける `CHECK` 制約は存在しない。

したがって「`status = 'bought'` だが `actualPriceAmount` / `actualStoreId` が `NULL`」という行は
現行スキーマで既に表現可能であり、`DrizzleShoppingListRepository` の読み書きロジックも
`row.actualPriceAmount === null ? null : Money.of(...)` のように null 分岐済み（変更不要）。

## フロントエンド設計

デザインコンセプト（`apps/web/src/app/globals.css` `:root` トークン、`--primary: #C64B27` の
テラコッタ・クリーム背景 `--background: #FAF6F0`・丸ゴシック `Zen Maru Gothic`）に準拠する。
既存の選択状態パターン（`bg-primary text-primary-foreground border-primary` + `Check` アイコン）は
維持する。

### `shopping-item-row.tsx` の変更

**Props の変更**

```ts
interface Props {
  item: ShoppingItemDto;
  stores: StoreDto[];
  expanded: boolean;
  submitting: boolean;
  onToggleExpand: (itemId: string) => void; // 「金額を記録」ボタン用に用途を絞る（既存プロップ名は維持）
  onSetChecked: (itemId: string, checked: boolean) => void; // 新規: チェックボタン用
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
}
```

**チェックボタン（既存の `role="checkbox"` ボタンを流用・挙動のみ変更）**

- `onClick`: `onToggleExpand(item.id)` → **`onSetChecked(item.id, !bought)`** に変更。
  現在表示している `bought` の否定値を「望む状態」として送る（UI 上はトグルに見える。
  §API 設計の Set 操作の設計意図と一致）。
- `aria-label`: 現在の固定文言 `${item.displayName}を購入済みにする` は一方向操作を前提にしており、
  トグルになった今は不正確。`bought ? \`${item.displayName}のチェックを外す\` : \`${item.displayName}をチェックする\`` に変更する。
- タップの視覚フィードバック: 既存の `transition-colors` に加えて **`active:scale-[0.98]`** を
  追加することを推奨する。理由: `apps/web/src/app/_components/dashboard.tsx`（クイックアクション
  ボタン）で既に同じ値が使われており新規パターンではない。また「タップ＝展開」から「タップ＝即座に
  状態が変わる」に体験が変わるため、縮小フィードバックで「今、操作が実行された」ことを伝える価値が
  従来より大きい。反対の選択肢（フィードバックなし）は既存の `transition-colors`（背景色変化）
  だけでも「押した感」は一定程度伝わるため許容範囲だが、推奨は付与する方。

**価格記録の新しい導線（新規ボタン）**

- チェック済み（`bought === true`）のときのみ表示する「金額を記録」ボタンを、チェックボタンと
  数量表示の間、または行の右側（店舗バッジの並びなど）に追加する。
  `onClick`: `onToggleExpand(item.id)`（既存の展開トグルをそのまま使う）。
- ラベル文言は実装時の裁量とするが、シンプルに常に「金額を記録」で統一することを推奨する
  （`actualPrice` の有無で「記録」/「編集」を出し分ける案も検討したが、コピーの条件分岐が増える
  わりに実用上の価値が小さいため見送りを推奨。実装者の裁量で採用してもよい）。
- 既存の店舗バッジ変更ボタン（`resolveStoreName` 付近）と視覚的に競合しないよう、
  `text-xs text-muted-foreground` 程度の控えめなテキストボタン/リンクとして配置する
  （新規 UI プリミティブは追加しない。D-4 の方針を継承）。

**`PurchaseInputForm` の表示条件**

- 現状 `{expanded && <PurchaseInputForm .../>}` を **`{bought && expanded && <PurchaseInputForm .../>}`**
  に変更する。チェックを外した瞬間に価格フォームが開いたままにならないようにするための安全策
  （チェック解除時に `expandedItemId` を親側でクリアする設計と合わせた二重の防御。§バックエンド設計
  ではなく Presentation 側のみの話だが、堅牢性のため両方に入れることを推奨）。

### `purchase-input-form.tsx` の変更

- L52-56 の注記文言「購入済みの品目です。金額・店舗は訂正できますが、**未購入には戻せません**。」は
  本設計により事実と異なるため修正が必須（チェックを外せば `pending` に戻り、その際 `actualPrice` /
  `actualStore` もクリアされる。§バックエンド設計 uncheck 仕様）。
  推奨文言: 「金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。」
  この画面は本設計後は「`bought` のときのみ開く」ため、`item.status === 'bought'` の条件分岐は
  実質的に常に真になる。条件を外して常時表示にする（無条件化）ことを推奨するが、防御的にそのまま
  残しても実害はない（実装者の裁量）。

### `store-group.tsx` / `shopping-list-client.tsx` の変更

- `store-group.tsx`: 新規 `onSetChecked` プロップを `ShoppingItemRow` へそのまま中継する
  （既存の `onMarkAsBought` / `onReassignStore` と同じパターン）。
- `shopping-list-client.tsx`: 新規 `handleSetChecked(itemId: string, checked: boolean): void` を
  追加する。既存 `handleMarkAsBought` と同じ `useOptimistic` + `startTransition` +
  `submittingItemId` パターンを踏襲する。

  ```ts
  function handleSetChecked(itemId: string, checked: boolean): void {
    if (submittingItemId === itemId) return;
    setSubmittingItemId(itemId);
    setErrorMessage(null);
    startTransition(async () => {
      setOptimisticItems({
        itemId,
        patch: checked
          ? { status: 'bought' }
          : { status: 'pending', actualPrice: null, actualStoreId: null },
      });
      try {
        const response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
          param: { id: shoppingList.id, itemId },
          json: { checked },
        });
        if (!response.ok) {
          setErrorMessage('操作に失敗しました。');
          return;
        }
        const updated: ShoppingItemDto = await response.json();
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        if (!checked) {
          // チェックを外したら価格フォームも閉じる（誤操作防止）
          setExpandedItemId((current) => (current === itemId ? null : current));
        }
      } catch {
        setErrorMessage('通信エラーが発生しました。');
      } finally {
        setSubmittingItemId(null);
      }
    });
  }
  ```

  上記コード例は設計意図を示す参考実装であり、最終的な変数名・分岐の書き方は実装者の裁量とする。

## バックエンド設計

### Domain: `packages/domain/src/shopping-list/shopping-list.ts`

`ShoppingItem` に 2 メソッドを追加する。

```ts
/**
 * 価格・店舗を記録せずに購入済み（チェック済み）にする軽量操作。現状態を問わず 'bought' へ
 * 遷移する（markAsBought と同様、S-11 の「最新状態で上書き」思想を踏襲）。actualPrice /
 * actualStore には触れない。
 */
check(): void {
  this.itemStatus = 'bought';
}

/**
 * チェックを外し 'pending' に戻す。actualPrice / actualStore も同時に null へ戻す
 * （チェックを外した後に再チェックしたとき、無関係になった古い価格が黙って買い物完了時の
 * 価格記録に使われてしまう事故を防ぐため。再チェック後に価格を残したい場合はチェックを外す前に
 * 何もしない、または再度「金額を記録」で入力し直す）。
 * @throws Error status が 'bought' 以外の場合
 */
uncheck(): void {
  if (this.itemStatus !== 'bought') {
    throw new Error(`Cannot uncheck a ShoppingItem with status '${this.itemStatus}'`);
  }
  this.itemStatus = 'pending';
  this.itemActualPrice = null;
  this.itemActualStore = null;
}
```

`ShoppingList` に薄いラッパーを追加する（既存の `markAsBought` / `markAsSkipped` と同じ形）。

```ts
/** @throws Error active でない、または itemId の品目が存在しない場合 */
check(itemId: ShoppingItemId): void {
  this.assertActive('check');
  this.findItem(itemId).check();
}

/** @throws Error active でない、itemId の品目が存在しない、または品目が bought 以外の場合 */
uncheck(itemId: ShoppingItemId): void {
  this.assertActive('uncheck');
  this.findItem(itemId).uncheck();
}
```

**設計判断: `check()`/`uncheck()` の新設 vs 既存 `markAsBought` の signature 変更**

`markAsBought(price: Money | null, store: StoreId | null)` のように既存メソッドの引数を nullable
化し、null なら「チェックのみ」を表す案も検討したが、以下の理由で不採用とし、新規メソッド追加を
推奨する。

| 観点         | 案X: `markAsBought` を nullable 化                                                                                                            | 案Y（推奨）: `check()`/`uncheck()` を新設                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 後方互換     | Domain メソッドの signature が変わり、既存呼び出し元（`MarkAsBoughtUseCase`）の型が影響を受ける                                               | 既存メソッド無変更。呼び出し元・テストへの影響ゼロ                          |
| 意図の明確さ | 同じメソッド名で「チェックのみ」と「価格記録あり」の2つの意味を持つ。呼び出し側で null を渡し忘れると既存の価格を意図せず消す事故リスクがある | メソッド名が操作の意図（チェック vs 価格記録）を直接表す                    |
| 既存不変条件 | price/store の「両方 null か両方非 null か」の追加バリデーションが必要になる                                                                  | 追加バリデーション不要（`check()`は引数なし・`markAsBought`は従来通り必須） |

### Application: `packages/application/src/shopping-list/set-item-checked.use-case.ts`（新規）

```ts
// packages/application/src/shopping-list/shopping-list.dto.ts に追加
export interface SetItemCheckedInputDto {
  shoppingListId: string;
  itemId: string;
  checked: boolean;
}
```

```ts
/**
 * 品目のチェック状態（購入予定に印を付ける／外す）を明示的にセットする。価格・店舗の記録は
 * 行わない（`MarkAsBoughtUseCase` が別途担当）。
 *
 * 冪等: input.checked が現在の状態と既に一致する場合は Domain のメソッド呼び出し自体を
 * スキップする（`uncheck()` は status !== 'bought' で例外を投げるため、2人が同時に操作しても
 * 例外にならないようにするための Application 層のガード。D-7 の「2人利用」を踏まえた設計）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export class SetItemCheckedUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: SetItemCheckedInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'setItemChecked');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    const item = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (item === undefined) {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    const alreadyChecked = item.status === 'bought';
    if (input.checked && !alreadyChecked) {
      shoppingList.check(itemId);
    } else if (!input.checked && alreadyChecked) {
      shoppingList.uncheck(itemId);
    }

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
```

`skipped` 品目に対して `checked: true` が送られた場合（現状 UI からは発生しないが API としては
可能）、`alreadyChecked` は `false` なので `check()` が呼ばれ `bought` に遷移する。`checked: false`
の場合は `alreadyChecked` が `false` のため no-op で `skipped` のまま返る。いずれも例外にはならない
（`skipped` の UI/API は非公開のままだが、Domain の不変条件としては矛盾しない）。

### `packages/application/src/shopping-list/index.ts`

`export * from './set-item-checked.use-case';` を追加。

### `apps/web/src/server/routes/shopping-lists.ts`

```ts
.post(
  '/:id/items/:itemId/checked',
  zValidator('param', shoppingItemIdParamSchema),
  zValidator('json', setItemCheckedSchema),
  async (c) => {
    const { id, itemId } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new SetItemCheckedUseCase(shoppingListRepository());
    const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
    return c.json(dto, 200);
  },
)
```

`apps/web/src/server/app.ts` の `onError` は変更不要（3つの例外クラスとも既に登録済み）。

## エラー処理

外部 API・外部ストレージへの I/O は含まない（Neon PostgreSQL への通常の Repository 書き込みのみ）
ため、`create-design-document` Skill が要求するリトライ／タイムアウト／冪等性キー／部分失敗／
フォールバックの 5 項目は対象外とする。代わりに以下を明記する。

- **404**: `shoppingListId` / `itemId` が存在しない → `ShoppingListNotFoundError` /
  `ShoppingItemNotFoundError`（既存パターンを流用）。
- **422**: リストが `completed` → `InvalidShoppingListStateError`。フロントは
  `setErrorMessage('操作に失敗しました。')` を表示し、`useOptimistic` は自動的にロールバックされる
  （`setItems` を呼ばないため。既存の `handleMarkAsBought` 等と同一パターン）。
- **冪等性・同時実行**: 2人利用（D-7）を想定し、`SetItemCheckedUseCase` は「望む状態」を受け取り、
  既に目的の状態なら Domain メソッドを呼ばず no-op で成功を返す（例外化しない）。これにより
  A・B 両者がほぼ同時にチェックを入れても、2回目のリクエストはエラーにならず単に整合した結果を
  返す。ただし「A がチェック → B が外す」のような**意味的な競合**（最後の書き込みが勝つ）は
  解消しない。これは既存の `markAsBought`（S-11 で「最新の実績で上書き」と明記）や
  `reassignStore` と同じ Last-Write-Wins の設計に揃えるものであり、本設計固有の新しいリスクでは
  ない。

## ログと監視

- 新規のログ・監視要件はない。既存の Hono `onError` のフォールバック（`console.error` + 500）を
  そのまま踏襲する。個人開発（2人限定運用）規模のため、専用の監視基盤追加は対象外
  （既存踏襲・変更なし）。

## セキュリティ

- MVP1 は認証なし（`docs/decisions/ADR-0003-no-auth-in-mvp1.md`）。本機能も既存の他エンドポイントと
  同じ信頼モデル（Vercel URL を2人で共有）を前提とする。新たな認可判断は発生しない。
- 入力は `checked: z.boolean()` のみで、注入・型混乱等の新規攻撃面は増えない。

## 性能

- 1 リクエストにつき 1 リストの `findById`（品目含む JOIN）+ 1 回の `save`（既存の他 UseCase と
  同じアクセスパターン）。N+1 やインデックス追加の必要はない。
- フロントは `useOptimistic` により体感遅延ゼロ。既存の `handleMarkAsBought` と同一パターンのため
  新規の性能リスクはない。

## テスト方針

Vitest。変更したパッケージ（domain / application / api-contract / apps/web）に対応するテストを
追加・更新する。

### Domain（`packages/domain/src/shopping-list/shopping-list.test.ts`）

- `ShoppingItem.check()`: `pending → bought` に遷移し、`actualPrice`/`actualStore` は変化しない
  （元々 null なら null のまま）ことを確認。
- `ShoppingItem.uncheck()`: `bought → pending` に遷移し、`actualPrice`/`actualStore` が `null` に
  クリアされることを確認（`markAsBought` で価格を記録済みの状態から実行するケースを含める）。
- `ShoppingItem.uncheck()` は `status !== 'bought'`（`pending`/`skipped`）のとき `Error` を投げる。
- `ShoppingList.check(itemId)` / `uncheck(itemId)`: `completed` リストに対して呼ぶと `Error`
  （`assertActive` 経由）。存在しない `itemId` で `Error`。

### Application

- 新規 `describe('SetItemCheckedUseCase')`（`shopping-list-use-cases.test.ts` へ追加、既存の
  `describe('MarkAsBoughtUseCase')` 等と同じファイル・スタイル）:
  - `checked: true` を `pending` 品目に送ると `bought` になる。
  - `checked: false` を `bought` 品目に送ると `pending` になり `actualPrice`/`actualStoreId` が
    `null` になる。
  - **冪等ケース**: 既に `bought` の品目に `checked: true` を送っても例外を投げず、そのまま
    `bought` を返す（`ShoppingList.check` が呼ばれない=save後も状態不変であることを確認）。
    既に `pending` の品目に `checked: false` を送る場合も同様。
  - リストが `completed` のとき `InvalidShoppingListStateError`。
  - 存在しない `shoppingListId` / `itemId` でそれぞれ `NotFoundError` 系。
- `complete-shopping.use-case.test.ts` の既存 `it.each`（L349-384、価格記録スキップ条件の表）に
  **`actualPrice が null（チェックのみで金額未記録）`** のケースを追加する（現状は
  `Money.of(0, 'JPY')` のみで、`null` そのものを明示的に検証していない。ロジック自体は
  `buildPriceRecord` が既に対応済みだが、要件 R-4 を回帰から守るため明示テストを追加する）。

### api-contract（`packages/api-contract/src/shopping-list.schema.test.ts`）

- `setItemCheckedSchema` が `{ checked: true }` / `{ checked: false }` を受理し、`checked` が
  真偽値以外・欠落のとき拒否することを確認。詳細な観点は §Contract 7. 契約テスト方針を参照。

### apps/web

- `apps/web/src/server/routes/shopping-lists.test.ts`: 新規ルートの 200/404/422 を確認する
  テストを追加（既存の `/bought` `/target-store` ルートテストと同じ形）。§Contract 7. で挙げた
  冪等性の契約テスト（同一 `checked` を連続送信しても 200 が返り続けること）も含める。
- `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`: 既存 IR-xx に対する
  影響を整理する。
  - **IR-06（チェックボタン click で `onToggleExpand` が呼ばれる）を修正**: チェックボタンの
    `onClick` は `onSetChecked` を呼ぶように変わるため、アサーション先を
    `onSetChecked('item-1', true)`（pending から）/ `onSetChecked('item-1', false)`（bought から）
    の2ケースに分割する。
  - **IR-12（bought item でもチェック解除に相当する UI が存在しない）を削除**: S-3 の制約を
    直接検証するテストであり、本設計により前提が変わるため削除し、代わりに「bought item の
    チェックボタンをクリックすると `onSetChecked(id, false)` が呼ばれる」ことを確認するテストに
    置き換える。
  - **IR-09/IR-10（expanded の表示制御）に追加**: `item.status === 'pending'` かつ
    `expanded === true` のとき `PurchaseInputForm` が表示されない（`bought &&` ガードの検証）
    ケースを追加。
  - 新規: 「金額を記録」ボタンは `bought` のときのみ表示され、クリックで `onToggleExpand` が
    呼ばれることを確認するテストを追加。
- `apps/web/src/app/shopping-lists/_components/purchase-input-form.test.tsx`:
  文言変更後のテキストに合わせてアサーションを更新。
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`: 新規
  `handleSetChecked` の optimistic 更新・成功時・失敗時（ロールバック）のテストを追加
  （既存の `handleMarkAsBought` テストと同じ観点）。

## 移行とリリース

- **マイグレーション不要**（§DB 設計）。
- **段階的リリース不要**（フィーチャーフラグ等は導入しない。個人開発規模のため一括デプロイで問題ない）。
- **既存 API の扱い（要件 R-5 の詳細）**: `MarkAsBoughtUseCase` / `markAsBoughtSchema` /
  `POST /api/shopping-lists/:id/items/:itemId/bought` は**廃止せず、そのまま残す**。理由:
  1. 価格・店舗の記録／訂正という別ユースケースとして引き続き必要（本設計の要件 R-3）。
  2. 既存テスト（`shopping-list-use-cases.test.ts` の `describe('MarkAsBoughtUseCase')`、
     `shopping-lists.test.ts` のルートテスト、`complete-shopping.use-case.test.ts`）への影響がゼロになる。
  3. `packages/application/src/shopping-list/mark-as-bought.use-case.ts` の JSDoc
     「bought への再適用・skipped からの購入確定は最新の実績で上書きする（S-11a/S-11b）」の
     契約も変更しないため、外部から見た挙動保証が壊れない。
- **`docs/designs/shopping-list-screens.md` の更新方針（要件 6・実際の編集は本タスクでは行わない）**:
  - S-3 の見出し（`### S-3: チェック解除（bought→pending）UI・UseCase の要否（S-B3）`、L136）の
    直後に、以下のような supersede 注記を追加する（`docs/04-domain-model.md` の Pantry セクションで
    使われている「実装追記」ブロックと同じ形式を踏襲）:

    ```markdown
    > **Superseded（2026-07-24, `docs/designs/shopping-list-item-check.md`）**: 本セクションの結論
    > 「チェック解除 UI・UseCase は実装しない」は撤回された。ユーザーが「チェック操作を価格記録から
    > 分離し、チェックは何度でも外せるようにする」ことを明示的に要求したため、`ShoppingItem.check()` /
    > `uncheck()` と `SetItemCheckedUseCase` / `POST /api/shopping-lists/:id/items/:itemId/checked`
    > を新設して bought→pending の逆遷移を可能にした。以下の案 A〜C の比較・確定理由は判断の経緯
    > として残すが、現行の結論ではない。詳細は `docs/designs/shopping-list-item-check.md` を参照。
    ```

  - 併せて次の 4 箇所も同じ理由で古くなるため、implementer は上記注記からの参照で足りるか、
    各箇所に短い注記を追加するかを判断すること（本設計では列挙のみ行い、編集はしない）:
    - L56 のサマリ表「S-3」行（「実装しない」列）。
    - L103「対象外」箇条書きの「チェック解除（bought→pending）UseCase・API の新規実装（S-3。
      実装しない）。」。
    - L631 の R-5 リスク行（「S-3（チェック解除なし）のまま運用すると…」）。
    - L664「将来課題」箇条書きの「チェック解除（bought→pending）UseCase・API の新規実装（S-3）。」。
  - `docs/04-domain-model.md` の ShoppingList 集約セクション（L413-484）にも、Pantry セクション
    （L490-495）と同じ形式で「実装追記」ブロックを追加し、`check()`/`uncheck()` の追加と
    `ItemStatus` の意味変化（`bought` は「価格記録済み」を含意しなくなった）を明記することを推奨する。

- 上記のドキュメント更新は、実装 PR に含めるか、Orchestrator の判断で別コミットに分けるかを
  委ねる（本設計書では方針の明記のみ）。
- **ADR の要否**: S-3 はユーザー確定済みの判断であり、それを覆す本設計は
  `.claude/skills/create-adr` の対象になりうる（過去の ADR-0006/0007 も同種の粒度で作成されている）。
  ADR を作成するかどうかは Orchestrator 経由でユーザーに確認することを推奨する（§未決事項）。

## リスク

| ID  | リスク                                                                                                                        | 影響                           | 対策                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `uncheck()` が `actualPrice`/`actualStore` をクリアする仕様に対し、ユーザーが「うっかり外して価格入力が消えた」と感じる可能性 | 軽微な UX 不満                 | チェック解除の直後に価格が消えることは意図的な設計判断として文言で示す（§フロントエンド設計の推奨文言）。再入力の手間は「金額を記録」ボタンで最小化される |
| R-2 | `docs/designs/shopping-list-screens.md` の S-3 関連 4 箇所を更新し忘れると、設計書間で矛盾した記述が残る                      | ドキュメントの信頼性低下       | §移行とリリースに更新対象箇所を列挙済み。実装 PR のレビューチェックリストに含めることを推奨                                                               |
| R-3 | Last-Write-Wins のままのため、2人が「チェック」と「解除」をほぼ同時に行うと最後の書き込みが勝つ（意味的競合は解消しない）     | 稀に意図と異なる最終状態になる | 既存の `markAsBought`/`reassignStore` と同じ設計思想（許容範囲として明記済み）。WebSocket 等のリアルタイム同期は対象外のまま                              |

## 未決事項（2026-07-24 ユーザー確定によりすべて解消）

1. **ADR 作成の要否 → 作成する**。`docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`
   として作成する（本設計と同時に確定）。
2. **「金額を記録」ボタンのラベル・配置の最終決定**: §フロントエンド設計で「金額を記録」固定文言を
   推奨したとおりとする（実装時の軽微な UI 微調整の余地は implementer の裁量として残す）。
3. **`docs/designs/shopping-list-screens.md` / `docs/04-domain-model.md` の実ファイル更新 → 今回の
   実装作業に含める**。§移行とリリースに記載の supersede 注記・4 箇所の更新を実装計画に含める。
4. **`uncheck()` が価格をクリアする仕様 → クリアする（推奨案のとおり確定）**。データ整合性
   （古い価格が黙って買い物完了時に使われる事故の防止）を優先する。
