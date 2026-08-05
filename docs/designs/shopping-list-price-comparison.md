# 設計書: shopping-list-price-comparison

- ステータス: **実装済み**（2026-08-04）
- レベル: L2
- スプリント: Sprint 7（MVP2）タスク1
- 関連: `docs/05-roadmap.md` Sprint 7 タスク1 / `docs/designs/shopping-list-screens.md`（S-6・D-5・R-6・将来課題） /
  `docs/04-domain-model.md`（Product・ShoppingList） / `logs/2026-07-27.md`（単価 10 倍ズレ事故） /
  `docs/decisions/ADR-0013-store-limit-and-delete-cascade.md`（店舗 3 件上限）
- 要件定義書: なし（L2。既存画面・既存ロジックの変更で新規 API / DB スキーマ変更 / データ移行 /
  認証認可の変更を伴わないため作成しない）
- ADR: なし（既存アーキテクチャ原則の範囲内。逸脱点は本書 §フロントエンド設計 P-1 で理由を明記）

---

## 背景

MVP1 の `docs/designs/shopping-list-screens.md` S-6 では、価格比較インジケーターの表示レベルを
「案A: 推奨店舗バッジのみ」に確定した。理由は当時、案B（金額差の一括表示）を採用すると
「一意な `productId` の数だけ `GET /api/products/:id` を `Promise.all` で並列実行する必要があり、
バルク取得 API が存在しないため N+1 相当の呼び出しが発生し、低速回線で表示が遅延する」
というものだった（同設計書 §S-6 詳細 / R-6 で意図的な未達として記録済み）。

この前提を今回改めて裏取りした結果、**現在は成立しない**ことを確認した。

- `GET /api/products`（`GetProductsUseCase.execute()`。`packages/application/src/product/get-products.use-case.ts`）は
  `ProductRepository.findAll()` + `StoreRepository.findAll()` を呼ぶだけで、**全商品の `priceHistory` を
  1 回のレスポンスで丸ごと返す**。
- `DrizzleProductRepository.findAll()`（`packages/infrastructure/src/repositories/drizzle-product.repository.ts:53-64`）は
  `products` と `price_records` を単一の `leftJoin` で結合する 1 クエリであり、N+1 は発生しない。
- `price_records` には `productId` にインデックスが張られている
  （`packages/infrastructure/src/db/schema.ts:69`。`findAll()` は全件走査だが、商品数は roadmap
  Sprint 2 完了条件「商品を 20 件程度登録できる」の規模であり、2 人運用で問題になる件数ではない）。

つまり S-6 が却下した「案B は N+1 になる」という根拠は、`GET /api/products:id` を商品ごとに
並列呼び出しする実装を前提にした場合の話であり、**バルク取得 API（`GET /api/products`）を
1 回呼ぶだけで全商品の価格履歴が揃う**という事実を見落としていた。本タスクでは
**新規 API を作らずに**、この既存のバルク取得 API を買い物リスト詳細画面の初期表示に
追加するだけで、roadmap Sprint 4 タスク4 の例示「A店の方が◯円安い」を満たす。

Sprint 7 のタスク一覧（`docs/05-roadmap.md` §Sprint 7）における本タスクの位置づけ:

| #   | タスク                                         | 本書の扱い         |
| --- | ---------------------------------------------- | ------------------ |
| 1   | 価格差の定量表示                               | **本書のスコープ** |
| 2   | 価格記録の編集                                 | 別タスク（対象外） |
| 3   | 店舗のリネーム                                 | 別タスク（対象外） |
| 4   | 商品詳細の DB 往復削減 + recharts 遅延読み込み | 別タスク（対象外） |

## 目的

- 買い物リストの各品目に、換算可能な店舗間の**概算総額差**（「◯店の方が約△円安い」）を表示する。
- チェック済み・未チェックを問わず、商品マスタに紐づく品目であれば店舗別の単価内訳を確認できるようにする。
- 既存の推奨店舗バッジ（S-6 案A）・店舗ごとのグルーピング表示には手を加えない。

## 要件

Sprint 7 タスク1の完了条件（roadmap）と、ユーザー確定済みの P-1〜P-4（本書 §フロントエンド設計）から導く。

- 買い物リストで「どちらの店舗が何円安いか」が画面で分かる（roadmap 完了条件）。
- 表示対象は `productId` を持つ品目のみ（手動追加で商品マスタに紐付いていない品目は対象外）。
- 換算可能な店舗が 2 件未満、または差額が 0 円のときは表示しない（過剰な情報表示を避ける）。
- 既存の 390px モバイル前提のレイアウト（3 カラム構造・`w-28` 固定幅の店舗バッジ）を崩さない。
- 新規 API・DB スキーマ変更・認証認可の変更は行わない。

## 対象範囲

- `apps/web` の Presentation 層のみ（`apps/web/src/app/shopping-lists/` 配下）。
- 既存の `GetShoppingListUseCase` / `GetStoresUseCase` / `GetProductsUseCase`（いずれも変更なし）を
  買い物リスト詳細画面の初期表示で追加利用する。
- 新規ファイル: `_utils/price-comparison.ts`（純粋関数）、`_components/store-unit-price-list.tsx`（共有表示コンポーネント）。
- 変更ファイル: `[id]/page.tsx` / `_components/shopping-list-client.tsx` / `_components/store-group.tsx` /
  `_components/shopping-item-row.tsx` / `_components/purchase-input-form.tsx`。

## 対象外

- 新規 API・API Contract（Zod）変更、DB スキーマ変更、データ移行。
- バルク取得 API の新設（背景の裏取りにより不要と判明したため）。
- Application / Domain / Infrastructure 層の変更（既存 UseCase をそのまま利用する）。
- 推奨店舗バッジ（`store-group.tsx` のヘッダー表示、S-6 案A）自体の変更・削除。
- 推奨店舗（`targetStoreId`）と最安店舗が食い違う場合の表示の一致化（P-2 で明示的に許容）。
- Sprint 7 タスク2（価格記録の編集）・タスク3（店舗のリネーム）・タスク4（商品詳細の DB 往復削減）。
- products 側の `formatUnitPrice`（`apps/web/src/app/products/_utils/product-format.ts`）の変更
  （機能ローカルで複製する。既存コードには一切触れない）。
- PWA `runtimeCaching` への追加エントリ（`GET /api/products` は本書のスコープでは初期表示の
  Server Component 直呼び出しのみで、Client からの Hono RPC 呼び出しを行わないため対象外）。
- 認証・複数ユーザー対応（ADR-0003 / ADR-0004 継続）。

---

## 現状構成

```
apps/web/src/app/shopping-lists/
├── [id]/page.tsx                          # Server Component。GetShoppingListUseCase + GetStoresUseCase を Promise.all
├── _components/
│   ├── shopping-list-client.tsx           # 状態管理の中心。items: ShoppingItemDto[] を state で保持
│   ├── store-group.tsx                    # 店舗ごとのグループ（推奨店舗バッジ = ヘッダーの店舗名のみ）
│   ├── shopping-item-row.tsx              # item 1 行。bought かつ !readOnly のときのみ展開トリガー表示
│   └── purchase-input-form.tsx            # 展開パネル（価格・実購入店舗の入力のみ）
└── _utils/
    └── shopping-list-view.ts              # groupItemsByStore / formatShoppingDate 等
```

現状、価格情報（`ProductDto` / `PriceRecordDto`）は買い物リスト詳細画面に一切渡っていない
（`[id]/page.tsx` は `GetShoppingListUseCase` と `GetStoresUseCase` のみ呼ぶ）。したがって
`shopping-item-row.tsx` は品目名・数量・推奨店舗バッジ・購入実績のみを表示し、金額差の計算・表示ロジックは存在しない。

## 変更後構成

```
apps/web/src/app/shopping-lists/
├── [id]/page.tsx                          # 変更: GetProductsUseCase を Promise.all に追加
├── _components/
│   ├── shopping-list-client.tsx           # 変更: products prop 追加 + useMemo で productMap 構築 + 中継
│   ├── store-group.tsx                    # 変更: productMap を中継するだけ（ロジック追加なし）
│   ├── shopping-item-row.tsx              # 変更: 総額差の行 + 展開トリガー条件の拡張 + 内訳の中継
│   ├── purchase-input-form.tsx            # 変更: 内訳セクションを追加（既存の入力ロジックは無変更）
│   └── store-unit-price-list.tsx          # 新規: 店舗別単価の内訳リスト（bought/未bought 両方から使う共有コンポーネント）
└── _utils/
    ├── shopping-list-view.ts              # 変更なし
    └── price-comparison.ts                # 新規: 単位換算・総額差・内訳の純粋関数群
```

既存の Recipe / MealPlan / Pantry / Product / Store / ShoppingList の Domain・Application・
Infrastructure・API Contract・Hono ルートには**一切変更を加えない**。

---

## データフロー

### 初期表示（詳細画面）

```
ブラウザ → /shopping-lists/[id]
  → [id]/page.tsx (Server Component, force-dynamic)
      → Promise.all([
          GetShoppingListUseCase.execute({ shoppingListId: id }),   # 既存
          GetStoresUseCase.execute(),                                # 既存
          GetProductsUseCase.execute(),                              # ★新規追加。全商品 + 価格履歴を1回で取得
        ])
      → catch (ShoppingListNotFoundError) → notFound()（既存どおり。他のエラーは throw）
      → products を shoppingList.items の productId 集合で絞り込む   # ★2026-08-04 追加
  → <ShoppingListClient shoppingList={dto} stores={stores} products={referencedProducts} />
```

`GetProductsUseCase.execute()` は引数を取らず、フィルタリングなしで全商品を返す（背景参照）。
買い物リストが参照する商品だけに絞り込む API は存在しないため、絞り込みは **Server Component 側**で
`shoppingList.items` の `productId` 集合を作って行い、Client Component へは参照される商品だけを渡す。
`ShoppingListClient` は Client Component なので `products` はそのままフライトペイロードへ直列化され、
**絞り込まないと全商品 × 全期間の価格履歴が毎回クライアントへ送られる**（価格記録は削除しない限り
貯まり続ける）。買い物中のモバイル回線が主要ユースケースであり、S-6 が案 B を却下した
「低速回線で表示が遅延する」懸念がペイロードサイズとして残るのを避ける（レビュー S-4。2026-08-04 修正）。
クライアント側の `productMap`（`Map<productId, ProductDto>`）の構築手順は変更しない。

### 表示計算（`ShoppingListClient` → `ShoppingItemRow`）

```
ShoppingListClient:
  productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  → <StoreGroup ... productMap={productMap} />（中継のみ）
      → <ShoppingItemRow ... productMap={productMap} />（中継のみ）
          → product = item.productId !== null ? productMap.get(item.productId) : undefined
          → priceDiff = estimateItemPriceDiff(item, product)     # 総額差（1行表示用）
          → breakdown = buildStoreUnitPriceBreakdown(product)    # 内訳（展開パネル用）
          → 描画（§フロントエンド設計 参照）
```

`products` / `stores` は初期表示時に一度だけ取得し、既存の `stores` prop と同様に
フォーカス復帰・手動更新（`handleRefetch`）では再取得しない。価格記録の追加・編集は
商品詳細画面という別の操作フローであり、買い物中の同一セッション内で頻繁に変わるものではない
ため、この既存パターン（D-7 の refetch 対象は品目のみ）を踏襲する。

### 既存の書き込みフロー（変更なし）

チェック（`handleSetChecked` / `handleMarkAsBought`）・手動追加・店舗再割当・削除・完了・
献立同期は本書の対象外で、既存ロジック（`shopping-list-client.tsx`）に一切手を加えない。
唯一の変更は、購入実績入力パネル（`PurchaseInputForm`）に内訳セクションが追加で描画される点のみ
（送信ペイロード・バリデーションは無変更）。

### 展開状態（`expandedItemId`）の再利用によって生まれる遷移

既存の `expandedItemId: string | null`（`shopping-list-client.tsx:80`）をそのまま使う（P-4）。
これにより、次の遷移が特別なハンドリングなしに成立する。

- 未購入品目で「店舗別の単価を見る」を開いた状態のまま、その品目をチェックすると
  （`handleSetChecked` は `checked === false` のときだけ `expandedItemId` をリセットする。
  `shopping-list-client.tsx:210-213`）、`expandedItemId` は保持されたまま `item.status` が
  `'bought'` に変わるため、**同じ行が開いたまま**内訳パネルから `PurchaseInputForm`
  （内訳セクション込み）へシームレスに切り替わる。
- 逆にチェックを外すと従来どおり `expandedItemId` がリセットされ、パネルごと閉じる（既存動作のまま）。
- `handleReassignStore`（`targetStoreId` の変更）は `productId` にも `priceHistory` にも影響しないため、
  総額差・内訳の計算結果には影響しない。

---

## API 設計

**変更なし。既存 API のみ使用する。** 新規 API・契約変更は行わない。

| 用途                                       | エンドポイント                                   | 画面での使い方                                                                |
| ------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| 商品 + 価格履歴の一括取得（★今回追加利用） | `GET /api/products` 相当（`GetProductsUseCase`） | `[id]/page.tsx` から Server Component で直接呼び出し（Hono RPC 経由ではない） |
| リスト詳細・店舗一覧                       | 既存どおり                                       | 変更なし                                                                      |

## DB 設計

**対象外（変更なし）**。既存の `products` / `price_records` / `shopping_items` テーブルをそのまま使用する。

---

## フロントエンド設計

### ユーザー確定事項（P-1〜P-4。すべて確定済み）

#### P-1: 集計ロジックの置き場所

**確定: Presentation 層の純粋関数**（`apps/web/src/app/shopping-lists/_utils/price-comparison.ts`）。

| 案        | 内容                                                                         | 長所                                                                                                                                                                       | 短所                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A（確定） | Presentation 層の純粋関数として実装                                          | DTO を受け取って表示値を作るだけの読み取り専用計算。既存の `formatUnitPrice` / `groupItemsByStore` と同じパターン。DTO・Zod 契約を変更しないため api-contract への波及なし | ドメイン層に「価格比較」という概念上の振る舞いを持たせない設計判断になる                                                                                                                                                                                          |
| B         | Domain 層に `Product.compareCheapestStores()` のような振る舞いを追加         | ドメインロジックとして一箇所に集約できる                                                                                                                                   | 比較は「必要量」という ShoppingItem 側の情報と「価格履歴」という Product 側の情報を組み合わせる**集約をまたぐ読み取り専用の表示計算**であり、書き込み一貫性を守るための集約境界とは性質が異なる。DTO 変更が必要になり L2 の前提（新規 API・契約変更なし）を超える |
| C         | Application 層に新規 UseCase（例: `CompareShoppingItemPricesUseCase`）を追加 | `.claude/rules/domain-layer.md` の「集約をまたぐ操作は Application 層の UseCase に置く」に文字どおり従う                                                                   | 対象は永続化も外部 I/O も伴わない「すでにクライアントに存在する 2 つの DTO 配列からの表示値の導出」であり、UseCase を新設するとネットワーク往復もドメイン操作も無いのに 1 UseCase = 1 クラスの形式だけを満たすための空疎な層になる。実体は表示計算そのもの        |

**`.claude/rules/domain-layer.md` からの逸脱理由**: 同ルールの「集約をまたぐ操作は Application 層の
UseCase に置く」は、複数集約の状態を一貫性を保って読み書きする**オーケストレーション**
（例: `GenerateShoppingListUseCase` が MealPlan / Recipe / Product / ShoppingList を横断して
生成・保存する）を対象にしている。本機能はそれとは性質が異なり、**すでに Server Component が
取得済みの 2 つの読み取り専用 DTO 配列（`ShoppingItemDto[]` と `ProductDto[]`）から表示用の値を
導出するだけ**で、リポジトリ呼び出しも永続化もドメインの状態変更も行わない。既存の
`groupItemsByStore`（`ShoppingItemDto[]` と `StoreDto[]` という異なる集約由来の DTO を組み合わせて
表示用グループを作る）や `formatUnitPrice`（`PriceRecordDto` から表示文字列を作る）がすでに
Presentation 層の `_utils/` に「DTO を受け取って表示値を作る」パターンとして実装・運用されており、
本機能はこの既存パターンをそのまま踏襲する。

#### P-2: 比較対象

**確定: 換算可能な店舗のうち 2 番目に安い店舗との差額**。差 0 円、または換算可能な店舗が 2 件未満なら
行を出さない。`targetStoreId`（推奨店舗）には依存しない。

理由: `targetStoreId` は買い物リスト生成時点で固定される値であり、その後の価格記録の追加・更新を
反映しない（古くなる）。総額差は生成時点の推奨ではなく、**現時点で入手可能などの店舗にも公平に**
最安・次点を探索して算出する。

**推奨店舗バッジと最安店舗が食い違うケースはそのまま許容する**（バッジは変更しない）。

| 案        | 内容                                                               | 長所                                                                                     | 短所                                                                                                            |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A（確定） | バッジは変更せず、総額差の文言・内訳は別途独立して表示する         | 実装がシンプル。バッジの意味（生成時点の推奨）と総額差の意味（現時点の最安）を混同しない | 画面内で「推奨店舗」と「最安店舗」という 2 つの異なる情報源が並び、ユーザーが違和感を持つ可能性がある           |
| B         | バッジの文言を仮定法にする（例:「◯店（最安ではない可能性あり）」） | 食い違いを明示できる                                                                     | 390px 幅でバッジのテキストが伸び、レイアウトを圧迫する（`w-28` 固定幅の店舗バッジは短い店舗名を前提にしている） |
| C         | バッジに印（アイコン等）を追加する                                 | 視覚的に軽量な警告ができる                                                               | バッジのタップ領域（店舗変更 UI への切り替えトリガーを兼ねる）を圧迫し、誤タップを誘発する                      |

#### P-3: 配置

**確定: 本文列（`flex-1 flex-col gap-1`。`shopping-item-row.tsx:94`）に縦積み 1 行追加**。既存の
3 カラム構造（チェックボタン／本文列／店舗バッジ・削除ボタン）と `w-28` 固定幅の店舗バッジには
一切触れない。展開パネル側は店舗ごとの単価を 1 行ずつ（最大 3 行。ADR-0013 の店舗上限）。

#### P-4: 内訳の展開条件

**確定: 未購入品目にも展開トリガーを出す**。

- トリガー条件を `{bought && !readOnly && ...}`（`shopping-item-row.tsx:113`）から
  `(bought || hasBreakdown) && !readOnly` へ広げる。
- ラベルは `bought ? '金額を記録' : '店舗別の単価を見る'` で出し分ける。
- 展開時の中身も出し分ける: `bought` は既存 `PurchaseInputForm`（内訳セクション込みに拡張）、
  未購入は内訳だけの読み取り専用の軽量パネル。
- 内訳リストは新規共有コンポーネント `store-unit-price-list.tsx` に切り出し、両方から使う。
- 既存 `expandedItemId` をそのまま使い、新規 state は追加しない（§データフロー 参照）。

### 計算仕様（`_utils/price-comparison.ts`）

#### 単位区分の判定

`UnitPriceCalculator`（`packages/domain/src/product/unit-price-calculator.ts:4-5`）と
**同一の厳密一致**で判定する。`normalizeUnit`（`packages/domain/src/shared/unit.ts`）は使わない。

理由: `Unit` は `packages/domain/src/shared/unit.ts` で `export type Unit = string`
（Sprint1 のプリセット固定方針を撤回済み・自由記述）であり、DB の `package_size_unit` /
`required_amount_unit` も `text` 型（プレーンな文字列）。値の入口は
`apps/web/src/lib/parse-quantity.ts` の `parseQuantity()` で、入力文字列全体を
`input.normalize('NFKC').trim()` してから数値と単位に分割している。この関数は
価格記録フォーム（`price-record-form.tsx`）・レシピ材料入力（`build-ingredient-input.ts`）・
買い物リスト手動追加（`add-item-form.tsx` → `QuantityField`）のすべてで単位入力の唯一の経路になっており、
`ShoppingItemDto.requiredAmount.unit` と `PriceRecordDto.packageSizeUnit` はどちらも
**この経路を通った時点で NFKC 正規化・trim 済み**である。表示側で追加の正規化
（`toLowerCase()` 等）を行うと、2026-07-27 の「単価 10 倍ズレ」事故
（`logs/2026-07-27.md`。表示側だけ `toLowerCase()` を足したことで `'KG'` のような入力が
「正準値は 1 単位あたり・表示は 1kg 基準」という食い違いを起こした）と同型の不具合を再発させる。
正準化と表示の単位判定は**必ず厳密一致で揃える**。

```typescript
type UnitBasisKind = 'weight' | 'volume' | 'other';

interface UnitBasis {
  kind: UnitBasisKind;
  /** 記録の値を正準単位（g / ml）へ換算する倍率。 */
  canonicalFactor: number;
  /** 正準値の分母（重量・容量は 100、それ以外は 1）。 */
  divisor: number;
}

// UnitPriceCalculator の WEIGHT_UNITS / VOLUME_UNITS と同一のリテラル判定。
function unitBasis(unit: string): UnitBasis {
  switch (unit) {
    case 'g':
      return { kind: 'weight', canonicalFactor: 1, divisor: 100 };
    case 'kg':
      return { kind: 'weight', canonicalFactor: 1000, divisor: 100 };
    case 'ml':
      return { kind: 'volume', canonicalFactor: 1, divisor: 100 };
    case 'l':
      return { kind: 'volume', canonicalFactor: 1000, divisor: 100 };
    default:
      return { kind: 'other', canonicalFactor: 1, divisor: 1 };
  }
}
```

#### アイテム行の概算総額差（`estimateItemPriceDiff`）

`requiredBasis = unitBasis(item.requiredAmount.unit)` と
`recordBasis = unitBasis(record.packageSizeUnit)` を**明確に別変数として扱う**。候補の絞り込みは
`kind` の一致で行うが（`kind === 'other'` の場合のみ生の単位文字列も一致させる。
「300g で必要」と「1袋あたり」のような異なる実世界の単位を同一視しないため）、

**換算係数は必ず `requiredBasis` を使う。`recordBasis` の値は使わない**:

```
estimatedTotal = record.unitPriceAmount
  * (item.requiredAmount.value * requiredBasis.canonicalFactor / requiredBasis.divisor)
```

**理由**: `PriceRecordDto.unitPriceAmount` は正準単位（重量なら 100g・容量なら 100ml・それ以外は
1 単位）を分母に持つ値（`UnitPriceCalculator` が算出・保存。`product.mapper.ts` はこれをそのまま
`PriceRecordDto` に写すのみで加工しない）なので、掛ける側（必要量）はその正準単位へ換算した数量で
なければならない。`canonicalFactor` は単位ごとに異なる（`g` は 1・`kg` は 1000）ため、
`recordBasis` を使うと桁がズレる。

**具体例（2026-07-27 の「単価 10 倍ズレ」事故と同型の欠陥を防ぐための固定例）**: 必要量
`0.3kg`・記録 `packageSize 500g`（¥250）のとき、`unitPriceAmount = 250 / 500 * 100 = 50`
（円/100g）。`requiredBasis`（`kg`: `canonicalFactor 1000, divisor 100`）を使えば
`estimatedTotal = 50 * (0.3 * 1000 / 100) = 50 * 3 = 150`（円）で正しいが、`recordBasis`
（`g`: `canonicalFactor 1`）を誤って使うと `50 * (0.3 * 1 / 100) = 0.15`（円）となり
**1000 倍ズレる**。

**手順**:

1. `item.productId` が `null` → なし
2. `item.requiredAmount` が `null` → なし（`amountNote` の品目。総額差の対象外）
3. `productMap.get(item.productId)` が見つからない、または `priceHistory` が空 → なし
   （商品削除後もその productId を参照する買い物品目は残りうる。`shopping_items.product_id`
   は DB 上 `references()` を持たない ID 参照のみのカラムであり
   〔`packages/infrastructure/src/db/schema.ts:126`〕、商品削除でカスケードされない）
4. `priceHistory` を店舗ごとに `observedAt` 最大の記録 1 件に絞る（`storeName === ''` の記録は除外。
   `product.mapper.ts` は削除済み店舗の `storeName` を `storeMap.get(...) ?? ''` で空文字に縮退させる
   ため、この防御的分岐で拾う。同一店舗・同一 `observedAt` の重複は運用上発生しない前提で、
   発生した場合は配列走査順で後に見つかった方を採用する）
5. `requiredBasis` と `recordBasis` の `kind` が一致する記録のみを候補にする
   （`kind === 'other'` は `record.packageSizeUnit === item.requiredAmount.unit` の完全一致も要求する）
6. 各候補について `estimatedTotal` を算出
7. 候補が 2 件未満 → なし
8. `estimatedTotal` の昇順に並べ、最安（1 位）と 2 番目（2 位）の差を `Math.round`
9. 差が 0 以下 → なし
10. `{ cheapestStoreId, cheapestStoreName, estimatedDiffYen }` を返す

**表示**: `` `${cheapestStoreName}の方が約${estimatedDiffYen}円安い` ``。**「約」は必ず付ける**
（必要量は集計値であり、実際の内容量・特売価格とは一致しない概算のため）。

#### 展開パネルの店舗別内訳（`buildStoreUnitPriceBreakdown`）

`item.requiredAmount` を使わない（`amountNote` の品目でも商品単位の比較として意味を持つため、
総額差とは独立させる）。手順:

1. `product`（`productMap.get(item.productId)`）が未検出、または `priceHistory` が空 → なし
2. 店舗ごとの直近記録に絞る（総額差と同じ手順4。`storeName === ''` を除外）。
   **除外の結果 2 件未満になったらここで打ち切る**（全記録が空文字の場合に手順3が
   空配列を走査するのを防ぐ。レビュー M-1）
3. 直近記録を `unitBasis(...).kind` で分類し、**記録数が最も多い kind** を**基準区分**とする。
   同数のときは `weight` → `volume` → `other` の固定順で決める（決定的な挙動にするため）。
   `unitPriceAmount` を kind をまたいで数値比較してはならない — 100g 単価・100ml 単価・
   1 単位あたりの価格は次元が違うため大小に意味が無く、少数派の kind がたまたま小さい値だと
   比較可能な多数派が丸ごと捨てられて内訳が静かに消える（レビュー S-3。2026-08-04 修正）
4. 基準区分と `kind` が一致する記録のみを残す
5. 残りが 2 件未満 → なし（内訳セクション自体を出さない）
6. `unitPriceAmount` 昇順に並べる
7. 表示は**正準基準に統一する**（`formatUnitPrice` は使わない）。`unitPriceAmount` はすでに
   正準値（100g / 100ml / 1 単位あたり）なので、**追加の換算は不要**でそのまま使う。
   `formatUnitPrice`（products 側）は記録ごとの内容量の単位に合わせて表示基準を可変にする
   （`kg` で買った記録は「1kg あたり」表示）が、本機能では**各店舗が `kg` 表示 / `g` 表示と
   別の単位を選んでいても直接比較できるようにする**ため、あえて基準を固定する
8. ラベルは `kind === 'weight'` → `'100g'` / `kind === 'volume'` → `'100ml'` /
   `kind === 'other'` → `` `1${ソート後1位のpackageSizeUnit}` ``
9. 最安値（ソート後 1 位の `unitPriceAmount`）と同額の行はすべて「← 最安」（**同額が複数ある場合は
   両方を最安扱いにして優劣をつけない**）。それ以外は「+{差}円」（`Math.round(unitPriceAmount - 最安値)`。
   こちらは正準化済み単価そのものの差なので「約」は付けない）。
   ただし**丸めた差が 0 になった行は「ほぼ同額」**と表示する — `unitPriceAmount` は小数第 1 位まで
   保持される（`numeric(10,1)`）ため、`100.0` と `100.4` のように 1 円未満の差が普通に発生し、
   そのまま「+0円」と出すと「差が無いのに片方だけ最安」に見える（レビュー S-1。2026-08-04 確定）

**既知の限定事項（新規導入ではなく既存の簡略化を踏襲）**: `kind === 'other'` の内訳比較は
`packageSizeUnit` の生文字列一致までは要求しない（総額差の候補絞り込みとは異なる）。これは
`UnitPriceCalculator` 自体が「重量・容量以外はすべて『1 単位あたり』」として正準化しており、
単位の実世界の意味（「1個」と「1パック」の違い等）を区別しない設計をすでに踏襲しているため
（`unit-price-calculator.ts:23-24`）。内訳は「この商品をこの単位区分で買うとどの店が安いか」の
参考情報であり、総額差のような金額計算には使わないため許容する。

**既知の限定事項 2: `basisLabel` の `1` 前置（2026-08-04 にユーザー判断で現状維持）**

`kind === 'other'` のラベルは `` `1${packageSizeUnit}` `` 固定である。`packageSizeUnit` は
`parseQuantity()` が「先頭の数値の後ろ」をそのまま単位として採るため（`lib/parse-quantity.ts:47-51`）、
内容量に「1 1L」と入力すると単位が `1L` になり、ラベルは「**11L**」と表示される。
2026-07-27 に本番で検出したバグ（`logs/2026-07-27.md:130-132`）と同型で、単位が自由記述である以上
「数字で始まる単位」は起こりうる。**表示の崩れに留まり金額計算には影響しない**ため、
Sprint 7 タスク1 のスコープでは修正せず限定事項として残す判断をした（レビュー S-2）。

同じく `kind === 'other'` は生文字列一致を要求しないため、「袋」と「パック」が混在すると
**基準記録の単位でまとめてラベル付けされる**（パックの価格が「300円 / 1袋」と表示される）。
上記の許容理由と同じ範囲として現状維持とする。将来、単位マスタ化や `other` の生文字列一致を
導入する際にまとめて解消する。

#### `formatYen` の複製

**複製する**（`shopping-list-view.ts` の「機能ローカルで重複定義する」規約に従う。products 側
`formatUnitPrice` の実体・呼び出し元は一切変更しない）。必要なのは `formatYen`
（数値→`"120円"`。`toLocaleString('ja-JP')` によるカンマ区切り）相当のみで、
`price-comparison.ts` 内に定義しエクスポートする。総額差の「約◯円安い」メッセージ本文は
本節の表示テンプレートどおりの直接埋め込みとし、`formatYen` は内訳リスト（`store-unit-price-list.tsx`）
の金額表示にのみ使う。

### 縮退ケース一覧

| #   | ケース                                                                                 | 総額差（1行表示） | 内訳（展開パネル）                                        |
| --- | -------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| 1   | `productId` が `null`（手動追加品目）                                                  | 非表示            | 非表示（トリガー自体を出さない）                          |
| 2   | 商品が削除済み（`productId` が products に存在しない）                                 | 非表示            | 非表示                                                    |
| 3   | 価格記録が 0 件                                                                        | 非表示            | 非表示                                                    |
| 4   | 換算可能な店舗が 1 件以下                                                              | 非表示            | 非表示（2 件未満）                                        |
| 5   | 必要量が `amountNote`（自由記述量）                                                    | 非表示            | **表示する**（内訳は `requiredAmount` に依存しないため）  |
| 6   | 単位区分が不一致（一部店舗のみ）で、一致する候補が 2 件未満に絞られる                  | 非表示            | 非表示                                                    |
| 7   | 店舗削除で `storeName` が空文字（ADR-0013 のカスケード削除で通常は起きない防御的分岐） | 候補から除外      | 候補から除外（**全件が空文字なら 2 件未満として非表示**） |
| 8   | 総額差が 0 円                                                                          | 非表示            | —                                                         |
| 9   | 内訳の全店舗が同額                                                                     | —                 | 全行「← 最安」                                            |

---

### コンポーネント設計

#### `_utils/price-comparison.ts`（新規）

```typescript
import type { ProductDto, PriceRecordDto, ShoppingItemDto } from '@cookpit/application';

export interface EstimatedPriceDiff {
  cheapestStoreId: string;
  cheapestStoreName: string;
  estimatedDiffYen: number;
}

export interface StoreUnitPriceEntry {
  storeId: string;
  storeName: string;
  unitPriceAmount: number;
  isCheapest: boolean;
  /** isCheapest のとき 0。 */
  diffFromCheapestYen: number;
}

export interface StoreUnitPriceBreakdown {
  /** '100g' | '100ml' | `1${unit}` */
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

export function estimateItemPriceDiff(
  item: ShoppingItemDto,
  product: ProductDto | undefined,
): EstimatedPriceDiff | null;

export function buildStoreUnitPriceBreakdown(
  product: ProductDto | undefined,
): StoreUnitPriceBreakdown | null;

export function formatEstimatedDiffMessage(diff: EstimatedPriceDiff): string;
// => `${diff.cheapestStoreName}の方が約${diff.estimatedDiffYen}円安い`

export function formatYen(amount: number): string;
// => `${amount.toLocaleString('ja-JP')}円`（products 側 formatYen の機能ローカル複製）
```

アルゴリズムの詳細は §計算仕様 のとおり。`unitBasis()` と店舗ごとの直近記録抽出
（`storeName === ''` 除外）は内部ヘルパーとしてこのファイル内に閉じ、外部に公開しない。

#### `_components/store-unit-price-list.tsx`（新規・共有コンポーネント）

```typescript
interface Props {
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

export function StoreUnitPriceList({ basisLabel, entries }: Props): JSX.Element;
```

各行: 店舗名 + `` `${formatYen(entry.unitPriceAmount)} / ${basisLabel}` `` + 右寄せの
`isCheapest ? '← 最安' : `+${entry.diffFromCheapestYen}円`` `。最大 3 行（ADR-0013 の店舗上限）。
`PurchaseInputForm`（bought）と `ShoppingItemRow` の未購入パネルの両方から呼ばれる。

#### `[id]/page.tsx`（変更）

`Promise.all` に `GetProductsUseCase.execute()` を追加する。`GetProductsUseCase` は
`ProductRepository` と `StoreRepository` の両方を要求するため、既存の `productRepository()` /
`storeRepository()` ファクトリ（`apps/web/src/server/repositories.ts`）をそのまま使う
（`storeRepository()` の呼び出しが 2 回になるが、いずれも `getDb()` の同一接続をラップするだけの
軽量なファクトリであり問題ない）。`GetProductsUseCase` は `NotFoundError` 系を投げないため、
既存の `catch (ShoppingListNotFoundError)` 分岐に変更は不要。

```typescript
const [shoppingList, stores, products] = await Promise.all([
  new GetShoppingListUseCase(shoppingListRepository()).execute({ shoppingListId: id }),
  new GetStoresUseCase(storeRepository()).execute(),
  new GetProductsUseCase(productRepository(), storeRepository()).execute(),
]);
```

#### `_components/shopping-list-client.tsx`（変更）

- Props に `products: ProductDto[]` を追加。
- `const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);`
- `<StoreGroup ... productMap={productMap} />` に中継。
- 他のロジック（`items` state・楽観的更新・`expandedItemId` 等）は無変更。

#### `_components/store-group.tsx`（変更・中継のみ）

`productMap: Map<string, ProductDto>` を Props に追加し、`<ShoppingItemRow ... productMap={productMap} />`
へそのまま渡す。グルーピングロジック（`groupItemsByStore`）・ヘッダー表示（推奨店舗バッジ）には触れない。

#### `_components/shopping-item-row.tsx`（変更）

- Props に `productMap: Map<string, ProductDto>` を追加。
- 計算:
  ```typescript
  const product = item.productId !== null ? productMap.get(item.productId) : undefined;
  const priceDiff = estimateItemPriceDiff(item, product);
  const breakdown = buildStoreUnitPriceBreakdown(product);
  const hasBreakdown = breakdown !== null;
  ```
- 本文列（`flex-1 flex-col gap-1`。既存 `shopping-item-row.tsx:94`）に、既存の数量表示
  （`requiredAmount` / `amountNote`）の行の直後・購入実績併記の行の前へ、新しい行を追加:
  ```tsx
  {
    priceDiff !== null && (
      <p className="text-xs text-muted-foreground">{formatEstimatedDiffMessage(priceDiff)}</p>
    );
  }
  ```
- 展開トリガー（既存 `shopping-item-row.tsx:113-122`）の条件を拡張:
  ```tsx
  {(bought || hasBreakdown) && !readOnly && (
    <button type="button" onClick={() => onToggleExpand(item.id)} disabled={submitting} ...>
      {bought ? '金額を記録' : '店舗別の単価を見る'}
    </button>
  )}
  ```
- 展開パネル（既存 `shopping-item-row.tsx:166-176` の `{bought && expanded && (...)}`）を分岐:
  ```tsx
  {expanded && (
    bought ? (
      <PurchaseInputForm item={item} stores={stores} submitting={submitting}
        breakdown={breakdown} onSubmit={...} onCancel={...} />
    ) : (
      hasBreakdown && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <StoreUnitPriceList basisLabel={breakdown.basisLabel} entries={breakdown.entries} />
        </div>
      )
    )
  )}
  ```

#### `_components/purchase-input-form.tsx`（変更）

- Props に `breakdown: StoreUnitPriceBreakdown | null` を追加。
- 既存の価格・実購入店舗入力・ボタン行（`priceInput` / `selectedStoreId` / `canSubmit` /
  `handleSubmit`）は**一切変更しない**。
- ボタン行の直後に、`breakdown !== null` のときだけ内訳セクションを追記:
  ```tsx
  {
    breakdown !== null && (
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <p className="text-xs font-medium text-foreground">店舗別の単価</p>
        <StoreUnitPriceList basisLabel={breakdown.basisLabel} entries={breakdown.entries} />
      </div>
    );
  }
  ```

### ビジュアル

既存のセマンティックトークン（`text-muted-foreground` / `text-foreground` / `border-border` /
`bg-card` 等）のみ使用。新規トークン追加はしない。既存の 3 カラム構造・`w-28` 固定幅バッジは変更しない。

## バックエンド設計

**対象外（変更なし）**。既存の Domain / Application / Infrastructure / Hono ルートをそのまま使用する。
`GetProductsUseCase` 自体への変更は行わない。

---

## エラー処理

外部 I/O の新設はない（既存 UseCase を新しい呼び出し箇所で使うのみ）ため、
`create-design-document` Skill の「外部 API / 外部ストレージへの I/O を含む場合のみ」必須の
リトライ・タイムアウト・冪等性・部分失敗・フォールバックの 5 項目は対象外とする。

| ケース                                                                  | 発生箇所                | 処理                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetProductsUseCase.execute()` が DB エラーで例外を投げる               | `[id]/page.tsx`         | 既存の `catch (ShoppingListNotFoundError)` 以外は再 throw（既存どおり Next.js エラーバウンダリへ）。`GetProductsUseCase` は NotFound 系エラーを投げないため、新たな catch 分岐は不要。**価格取得だけを `.catch(() => [])` で縮退させない判断は意図的**（下記） |
| `item.productId` が指す商品が見つからない（商品削除済み・データ不整合） | `shopping-item-row.tsx` | `product === undefined` として `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` が `null` を返す。例外は投げない。総額差・内訳とも非表示になるだけで、他の表示（品目名・数量・チェック操作）には影響しない                                             |
| 価格記録の単位区分が全店舗で不一致                                      | 同上                    | 候補が 2 件未満になり非表示。エラー表示はしない（正常な縮退）                                                                                                                                                                                                  |

**価格取得の失敗を縮退させない判断（2026-08-04 ユーザー確定 / レビュー S-5）**

価格比較は補助情報なので、`GetProductsUseCase` の失敗だけを `.catch(() => [])` で握りつぶし、
買い物リスト本体（品目一覧・チェック操作）は表示し続ける設計もありうる。レビュー S-5 はこれを
「ブラストレディウスが本 PR で広がっている」として推奨したが、**意図的に現状維持とした**。

理由: 価格取得が失敗する状況は DB 接続そのものの異常である可能性が高く、そこで
「品目一覧は出るが価格だけ黙って消える」状態にすると、ユーザーには**価格記録が無い品目と
区別がつかない**（本機能は縮退時に何も表示しないため）。誤った安心を与えるより、
画面ごとエラーにして異常を明示する方が MVP の 2 名限定運用では扱いやすい。
将来ユーザーが増え、部分的な不可用性を許容する必要が出たらこの判断を見直す。

## ログと監視

対象外（MVP1 方針どおり）。新たなログ出力・監視は追加しない。

## セキュリティ

- 認証なしは MVP1 の既存前提と同じ（本機能で状況は変わらない）。
- 新規のユーザー入力は追加しない（既存の `ProductDto` / `PriceRecordDto` を読み取って表示するのみ）。
- 表示文字列（`storeName` 等）は React の標準エスケープに委ねる。`dangerouslySetInnerHTML` は使用しない。
- `GetProductsUseCase` は認可チェックを持たないが、MVP1 は認証なし・2 名限定運用であり、
  既存の `GET /api/products` 相当のデータアクセス範囲を超えない。

## 性能

L2 かつ純粋な表示計算の追加であり、外部 I/O・大量データ集計の新設ではないため、
architecture-designer の性能設計基準（L3 限定の N+1/インデックス/負荷試験の厚い記載）は対象外とする。
実質的な変更点のみ記載する。

- **新規に発生する DB アクセス**: 買い物リスト詳細画面の初期表示に `GetProductsUseCase.execute()`
  （`products` × `price_records` の単一 `leftJoin`。§背景 参照）が 1 回追加される。既存の
  `GetShoppingListUseCase` + `GetStoresUseCase` と合わせて `Promise.all` で並列実行するため、
  直列化による遅延増加はない。商品数は roadmap Sprint 2 完了条件の規模（20 件程度）であり、
  レスポンスサイズ・クエリ時間ともに軽微（推定）。商品数が今後大きく増える場合は、Sprint 7
  タスク4（商品詳細の DB 往復削減）と合わせて再検討する。
- **書き込み経路への影響なし**: チェック・手動追加・店舗再割当・削除・完了は既存どおり
  レスポンスの更新後 DTO でローカル state を部分更新するため、`products` の再取得は発生しない。
- **クライアント側の計算コスト**: `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` は
  品目数（1 リストあたり数十件。既存の shopping-list-core 見積もりを踏襲）× 店舗数（最大 3。
  ADR-0013）程度のループであり、メモ化なしでも各行のレンダリングごとに再計算して問題ない
  規模（推定）。プロファイリングで問題が確認された場合のみ `useMemo` 化を検討する。
- **フォーカス復帰時の refetch**: `products` は再取得対象に含めない（§データフロー）。既存の
  `stores` と同じ扱いであり、新たなポーリング・追加リクエストは発生しない。

## テスト方針

apps/web のテスト基盤（Vitest 4 + RTL、`apps/web/tests/` が `src/` をミラー）は導入済み。

- **`_utils/price-comparison.ts` の単体テスト**（`apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`。
  DOM 非依存の純粋関数群のため、既存の `shopping-list-view.node.test.ts` と同じ `.node.test.ts` 命名に揃える）
  - **単位換算の 4 方向テストを必須**とする。片方向だけでは `requiredBasis` / `recordBasis` の
    取り違え（2026-07-27 事故と同型）を検出できない。期待値は手計算で固定する。

    | #   | 必要量   | 記録（内容量・価格） | `unitPriceAmount`（正準値） | 期待 `estimatedTotal`                                |
    | --- | -------- | -------------------- | --------------------------- | ---------------------------------------------------- |
    | A   | `0.3kg`  | `500g` / ¥250        | 50円/100g                   | 150円                                                |
    | B   | `300g`   | `1kg` / ¥500         | 50円/100g                   | 150円（A と同一実量・同一単価 → 一致することも確認） |
    | C   | `2l`     | `500ml` / ¥100       | 20円/100ml                  | 400円                                                |
    | D   | `2000ml` | `1l` / ¥200          | 20円/100ml                  | 400円（C と同一実量・同一単価 → 一致することも確認） |

    A・C は §計算仕様 に記載の「`recordBasis` を誤って使うと 1000 倍ズレる」具体例と同一の数値を
    使い、回帰テストとして固定する（実装が誤って `recordBasis` を使うと A は `0.15円` になり、
    テストが確実に失敗する）。B・D は「同じ実量を異なる単位で表現しても総額差の計算結果が一致する」
    という不変性を検証する追加ケースとして併記する。

  - `unitBasis()`（相当のロジック）の判定が `UnitPriceCalculator`（`packages/domain`）の判定基準から
    乖離しないことを固定するテスト。`WEIGHT_UNITS` / `VOLUME_UNITS` はモジュール非公開のため直接
    比較はできない。Vitest の Node 環境（`.node.test.ts`）でのみ `@cookpit/domain` を値 import して
    `UnitPriceCalculator.calculate(Money, Quantity)` の出力から間接的に正準化倍率を検証する
    （Client Component からの値 import 不可という制約は browser バンドル限定であり、Node 実行の
    テストファイルには適用されない。`store-name.node.test.ts` と同じアプローチ）。
  - 縮退ケース各種（§縮退ケース一覧 の 1〜9 すべて）。
  - 2 番目に安い店舗との差の算出（3 件以上の候補があるケースを含む）。
  - 同額時の扱い（総額差での 1 位・2 位同額 → 差 0 円で非表示。内訳での複数店舗同額 → 全行「← 最安」）。
  - `formatYen` / `formatEstimatedDiffMessage` の出力フォーマット。

- **RTL（コンポーネント）**
  - `shopping-item-row`: 総額差行の表示条件（`priceDiff !== null` のときのみ）、展開トリガーの
    条件拡張（`bought || hasBreakdown`）とラベル出し分け、未購入時の展開パネルが内訳のみである
    こと、`readOnly` のとき（`hasBreakdown` でも）トリガーが出ないこと。既存テスト
    （`apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx` の IR-01〜IR-24）
    に回帰がないこと。
  - `purchase-input-form`: `breakdown` が `null` のとき内訳セクションが出ないこと、`breakdown` が
    あるとき `StoreUnitPriceList` が描画されること。既存の価格・店舗入力のテストに回帰がないこと。
  - `store-unit-price-list`: 単体レンダリング（最安行のラベル・他行の差額ラベル・最大 3 行）。
  - `shopping-list-client` / `store-group`: `products` prop の中継が末端まで届くこと（結合レベルで
    1〜2 ケース）。
- **既存テストフィクスチャの拡張**: `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts`
  に `createProductDto` / `createPriceRecordDto` を追加し、既存の `createStoreDto` /
  `createShoppingItemDto` と同じパターンで新規テストから再利用できるようにする（アドホックな
  重複定義を避ける）。
- **実画面確認**: 実装後に **390px での表示崩れ確認が必須**（P-3 の縦積み追加行・P-4 の
  展開トリガー増加により、カードの縦幅・情報密度が増えるため）。manual-browser-verify スキルで
  「総額差の行が折り返さずに収まるか」「未購入品目の展開パネルが他の展開状態と競合しないか」を確認する。
- **API ルートテスト**: 変更なし・追加不要（新規 API を作らないため）。

## 移行とリリース

- DB スキーマ変更・マイグレーションなし。既存データへの影響なし。
- API・契約の変更なし（後方互換性の論点なし）。
- Vercel へのデプロイのみで完結。PWA `runtimeCaching` への変更もない。

## リスク

| #   | リスク                                                                                                           | 影響                                     | 対策                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | 390px 幅で総額差の行・展開パネルの追加により品目カードが縦に伸び、レイアウトが崩れる可能性                       | UX 上の見づらさ                          | 実装後の manual-browser-verify で 390px 確認を必須化（§テスト方針）                                                                           |
| R-2 | 商品数が将来大きく増えた場合、`GetProductsUseCase.execute()`（全件取得）のレスポンスサイズ・クエリ時間が増大する | 買い物リスト詳細画面の初期表示が遅延する | 現状規模（20 件程度）では軽微。Sprint 7 タスク4（商品詳細の DB 往復削減）や、必要になった時点でのページング/絞り込み API 新設を将来課題とする |
| R-3 | 推奨店舗バッジと最安店舗（総額差の表示）が食い違うケースで、ユーザーがどちらを信じるべきか混乱する               | UX 上の違和感                            | P-2 で明示的に許容したトレードオフ。「約」を必ず付けて概算であることを示し、バッジの意味（生成時点の推奨）は変えない                          |
| R-4 | 未購入品目にも展開トリガーが増えることで、リスト全体の情報密度・タップ要素が増える                               | 誤タップ・視認性低下の懸念（軽微）       | 実運用で気になる場合はラベル・アイコンの調整余地あり。Sprint 7 内では計測対象外                                                               |

## 未決事項

**なし。** 本タスクの論点（P-1〜P-4）はすべてユーザー確定済み。トレードオフ比較表（§フロントエンド設計）は
判断の経緯として残すが、いずれも「確定」であり再検討は要しない。

参考として、確定に至った経緯を記録する。

- **P-1**: Presentation 層の純粋関数として実装（`.claude/rules/domain-layer.md` からの逸脱理由を明記済み）。
- **P-2**: 換算可能な店舗のうち 2 番目に安い店舗との差額。`targetStoreId` に依存しない。バッジとの食い違いは許容。
- **P-3**: 本文列への縦積み 1 行追加。既存の 3 カラム構造・店舗バッジは変更しない。
- **P-4**: 未購入品目にも展開トリガーを拡張。既存 `expandedItemId` を再利用し新規 state は追加しない。

### 実装時の技術的補足（確認不要・実装者向けメモ）

- 同一店舗・同一 `observedAt` の重複記録が万一存在した場合、`latestRecordPerStore` 相当の
  ヘルパーは配列走査順で後に見つかった方を採用する（決定的な挙動にするための実装上の取り決めであり、
  通常運用では発生しない）。
- `kind === 'other'` の内訳比較は生文字列一致を要求しない（§計算仕様「既知の限定事項」参照。
  既存の `UnitPriceCalculator` の簡略化を踏襲しているだけで、本機能が新たに導入する制約緩和ではない）。
