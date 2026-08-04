# 試験計画: shopping-list-price-comparison

- 前提となる設計書: `docs/designs/shopping-list-price-comparison.md`（ステータス: 確定）
- レベル: L2
- 対象層: **Presentation 層のみ**（`apps/web`）。Domain / Application / Infrastructure / api-contract は無変更のため対象外。
- テストランナー: Vitest 4.1.10（`apps/web` は `vitest.node.config.mts` / `vitest.dom.config.mts` の 2 project 構成）。
- 実装状況（試験計画作成時点）: 未実装。`_utils/price-comparison.ts` / `_components/store-unit-price-list.tsx` は存在しない。以降の観点は設計書どおりの実装を前提にした計画であり、実装後にファイルパス・シグネチャの乖離がないか照合すること。

## 0. テスト対象コンポーネント一覧（実装コード走査結果）

| 種別                 | コンポーネント/関数                                                  | ファイル                                                                | 公開/非公開                                                                                 |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 新規・純粋関数       | `estimateItemPriceDiff`                                              | `apps/web/src/app/shopping-lists/_utils/price-comparison.ts`            | public                                                                                      |
| 新規・純粋関数       | `buildStoreUnitPriceBreakdown`                                       | 同上                                                                    | public                                                                                      |
| 新規・純粋関数       | `formatEstimatedDiffMessage`                                         | 同上                                                                    | public                                                                                      |
| 新規・純粋関数       | `formatYen`                                                          | 同上                                                                    | public                                                                                      |
| 新規・非公開ヘルパー | `unitBasis`                                                          | 同上                                                                    | **非公開**（設計書: 外部に公開しない）。PC-05/06 で間接検証                                 |
| 新規・非公開ヘルパー | 店舗ごとの直近記録抽出（`latestRecordPerStore` 相当）                | 同上                                                                    | **非公開**。PC-23/24 で間接検証                                                             |
| 新規コンポーネント   | `StoreUnitPriceList`                                                 | `apps/web/src/app/shopping-lists/_components/store-unit-price-list.tsx` | public                                                                                      |
| 変更コンポーネント   | `ShoppingListDetailPage`（default export, Server Component）         | `apps/web/src/app/shopping-lists/[id]/page.tsx`                         | default export（Next.js 規約）                                                              |
| 変更コンポーネント   | `ShoppingListClient`                                                 | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`  | public                                                                                      |
| 変更コンポーネント   | `StoreGroup`                                                         | `apps/web/src/app/shopping-lists/_components/store-group.tsx`           | public                                                                                      |
| 変更コンポーネント   | `ShoppingItemRow`                                                    | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`     | public                                                                                      |
| 変更コンポーネント   | `PurchaseInputForm`                                                  | `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`   | public                                                                                      |
| 無変更（既存利用）   | `GetShoppingListUseCase` / `GetStoresUseCase` / `GetProductsUseCase` | `packages/application/src/**`                                           | 既存 UseCase をそのまま利用。**本タスクでの試験対象外**（設計書§対象外・§バックエンド設計） |

## 1. 試験種別

- **単体**: `_utils/price-comparison.ts`（Node 環境、DOM 非依存の純粋関数）、`_components/store-unit-price-list.tsx`（DOM 環境、単体レンダリング）。
- **結合**: `shopping-item-row.tsx` / `purchase-input-form.tsx`（price-comparison.ts の計算結果を実際に描画へつなげる分岐確認）、`store-group.tsx` / `shopping-list-client.tsx`（`productMap` の中継確認）。
- **E2E**: 任意（§8 参照。本タスクでは実施しない）。

---

## 2. 単体試験観点

### 2-1. `_utils/price-comparison.ts`（`apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`）

vitest の node project は `include: ['tests/**/*.node.test.ts', 'tests/server/**/*.test.ts']`
（`apps/web/vitest.node.config.mts`）。このファイル名なら該当し、`.test.ts`（拡張子のみ）にすると
どちらの project にも一致せず silent skip になるため注意（既存 `shopping-list-view.node.test.ts` と同じ命名）。

#### 2-1-1. 単位換算の 4 方向テスト（★最重要・必須）

設計者が手計算で固定した期待値（A: 150円 / B: 150円 / C: 400円 / D: 400円）は**改変しない**。
ただし `estimateItemPriceDiff` は個々の候補の `estimatedTotal` を直接返さず、最安・2 番目の
**差額**のみを返す公開契約のため、単体では「差額」経由でこの内部値を間接的に固定する。
2 通りの手法を併用する。

- **A・C**: 設計書と同じ記録に加え、独立して検算できる**コントロール店舗**（別途固定した記録）を
  もう 1 件加えた 2 候補にし、`estimatedDiffYen` の厳密な数値一致で「その候補の estimatedTotal が
  ちょうど 150円 / 400円になっているか」を確定する。
- **B・D**: 「同一実量・同一単価なら異なる単位表記でも一致する」という設計書の要求を、
  A/C と対にして**差額 0 円（＝`null`）**という最も感度の高い形でテストする
  （わずかな誤差でも `null` にならず失敗する）。

| #     | 観点                                            | 前提                                                                                                                                                                                                                                                             | 操作                                   | 期待結果                                                                                                                                                                                                                                                       | 分類 |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PC-01 | 【A】必要量 `0.3kg` の絶対値検証（weight）      | `item.requiredAmount = {value:0.3, unit:'kg'}`。候補: 店舗X `{packageSizeValue:500, packageSizeUnit:'g', priceAmount:250}`（`unitPriceAmount=50`）／店舗Y（コントロール）`{packageSizeValue:1, packageSizeUnit:'kg', priceAmount:1200}`（`unitPriceAmount=120`） | `estimateItemPriceDiff(item, product)` | `{cheapestStoreId:'store-x', cheapestStoreName:'店舗X', estimatedDiffYen:210}`。<br>（店舗Xの内部 estimatedTotal は `50 * (0.3*1000/100) = 150`、店舗Yは `120 * 3 = 360`、差 `360-150=210`。210 以外が返ったら店舗Xの estimatedTotal が 150 円になっていない） | 正常 |
| PC-02 | 【B】必要量 `300g`（Aと同一実量）の一致性検証   | `item.requiredAmount = {value:300, unit:'g'}`。候補: 店舗X `{500g, ¥250}`（`unitPriceAmount=50`）／店舗Y `{1kg, ¥500}`（`unitPriceAmount=50`。設計書 B の記録）                                                                                                  | `estimateItemPriceDiff(item, product)` | `null`（両店舗とも `estimatedTotal=150` で一致 → 差 0 円 → 非表示）                                                                                                                                                                                            | 正常 |
| PC-03 | 【C】必要量 `2l` の絶対値検証（volume）         | `item.requiredAmount = {value:2, unit:'l'}`。候補: 店舗X `{packageSizeValue:500, packageSizeUnit:'ml', priceAmount:100}`（`unitPriceAmount=20`）／店舗Y（コントロール）`{packageSizeValue:1, packageSizeUnit:'l', priceAmount:800}`（`unitPriceAmount=80`）      | `estimateItemPriceDiff(item, product)` | `{cheapestStoreId:'store-x', cheapestStoreName:'店舗X', estimatedDiffYen:1200}`。<br>（店舗X `20*(2*1000/100)=400`、店舗Y `80*20=1600`、差 `1200`。1200 以外が返ったら店舗Xの estimatedTotal が 400 円になっていない）                                         | 正常 |
| PC-04 | 【D】必要量 `2000ml`（Cと同一実量）の一致性検証 | `item.requiredAmount = {value:2000, unit:'ml'}`。候補: 店舗X `{500ml, ¥100}`（`unitPriceAmount=20`）／店舗Y `{1l, ¥200}`（`unitPriceAmount=20`。設計書 D の記録）                                                                                                | `estimateItemPriceDiff(item, product)` | `null`（両店舗とも `estimatedTotal=400` で一致 → 差 0 円 → 非表示）                                                                                                                                                                                            | 正常 |

**このテスト群が落ちたら何を疑うか（回帰時の一次切り分け表）**:

| 症状                                                                                      | 疑うべき原因                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC-01 の `estimatedDiffYen` が `210` ではなく極端に小さい/大きい値（例: 359.85→360 付近） | `requiredBasis` の代わりに `recordBasis`（店舗Xの記録は `g` 単位）を使っている。2026-07-27 の「単価 10 倍ズレ」事故と同型（今回は最大 1000 倍ズレる） |
| PC-01 で `cheapestStoreId` が `store-y` になる                                            | 換算係数の取り違えにより安全店舗の順序が逆転している                                                                                                  |
| PC-02 / PC-04 が `null` を返さず値を返す                                                  | `item.requiredAmount.unit`（`g`/`ml`）と記録側の単位（`kg`/`l`）で異なる換算係数を使ってしまい、本来一致するはずの実量が一致しない                    |
| PC-03 の `estimatedDiffYen` が `1200` からズレる                                          | PC-01 と同型の取り違えが volume 側でも発生している                                                                                                    |

#### 2-1-2. `unitBasis` の判定基準（`UnitPriceCalculator` との整合性）

| #     | 観点                                                                                      | 前提                                                                                                                                                                                                                                                                                                                     | 操作                                                                                                                  | 期待結果                                                                                                                                                                                                            | 分類                   |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| PC-05 | `g`/`kg`/`ml`/`l` の正準化倍率が `UnitPriceCalculator` と一致する（値 import で間接検証） | `@cookpit/domain` から `UnitPriceCalculator` / `Money` / `Quantity` を値 import（`store-name.node.test.ts` と同じ Node 実行限定の手法）。`UnitPriceCalculator.calculate(Money.of(250,'JPY'), Quantity.of(500,'g'))` 等で `unitPriceAmount` を実装から生成し、PC-01/PC-03 と同じ組み立てで `estimateItemPriceDiff` に通す | 各単位（`g`,`kg`,`ml`,`l`）で PriceRecordDto を生成し `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` を呼ぶ | PC-01/PC-03 と同じ期待値が、ハードコードした `unitPriceAmount` ではなく `UnitPriceCalculator.calculate` の実出力から再現される                                                                                      | 正常                   |
| PC-06 | 大文字 `'KG'` 等の表記ゆれ単位は厳密一致せず候補から除外される（正規化なしの確認）        | `item.requiredAmount = {value:1, unit:'kg'}`。候補: 店舗X `{packageSizeUnit:'g', ...}`（正規の weight）／店舗Z `{packageSizeUnit:'KG', ...}`（大文字）                                                                                                                                                                   | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` を呼ぶ                                                       | 店舗Zは `kind='other'` 扱いになり weight 候補に加算されない結果、有効候補が店舗Xの 1 件のみとなり両関数とも `null`。**対照実験**として店舗Zの単位を正規の `'kg'` に直した場合は非 `null` になることも併せて確認する | 異常（表記ゆれの防御） |

#### 2-1-3. 候補の絞り込み条件

| #     | 観点                                                                   | 前提                                                                                                                                                                         | 操作                                   | 期待結果                                                                                                                                                            | 分類 |
| ----- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PC-07 | `kind==='other'` の総額差候補は `packageSizeUnit` の完全一致も要求する | `item.requiredAmount = {value:1, unit:'袋'}`。候補: 店舗X `{packageSizeUnit:'袋', ...}`／店舗Y `{packageSizeUnit:'パック', ...}`（同じ `kind='other'` だが生文字列が異なる） | `estimateItemPriceDiff(item, product)` | `null`（店舗Yが候補から除外され有効候補が1件になるため）。**PC-27（内訳は同じ商品データで非 null になる）と対で確認**し、総額差と内訳の絞り込み基準の違いを固定する | 境界 |
| PC-08 | `targetStoreId`（推奨店舗）に依存せず最安店舗を独立して算出する（P-2） | `item.targetStoreId` を最安ではない店舗（例: 店舗Y）に設定。候補は店舗X（安い）／店舗Y（高い）の2件                                                                          | `estimateItemPriceDiff(item, product)` | `cheapestStoreId` は `targetStoreId` と無関係に実際に安い店舗Xを返す                                                                                                | 正常 |
| PC-09 | 2 番目に安い店舗との差（3 件以上の候補、1 位と 2 位のみを比較）        | 候補 3 件、`estimatedTotal` が昇順で 100円・150円・300円になるよう記録を用意                                                                                                 | `estimateItemPriceDiff(item, product)` | `estimatedDiffYen = 50`（`150-100`）。`200`（`300-100`、3 位との差）にならないこと                                                                                  | 境界 |

#### 2-1-4. フォーマット関数

| #     | 観点                                                                                       | 前提                                                                                                                                                                    | 操作                                                            | 期待結果                                  | 分類 |
| ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | ---- |
| PC-10 | `formatYen` の出力フォーマット（カンマ区切り）                                             | `amount = 12345`                                                                                                                                                        | `formatYen(12345)`                                              | `'12,345円'`（`toLocaleString('ja-JP')`） | 正常 |
| PC-11 | `formatYen` が products 側 `product-format.ts` の `formatYen` と同一出力（複製の乖離防止） | `apps/web/src/app/products/_utils/product-format.ts` の `formatYen` を node テストから直接 import（`store-name.node.test.ts` と同じ「サーバー側実装との一致」パターン） | 複数の代表値（0, 1, 198, 12345, 1000000）で両実装を突き合わせる | 全ケースで一致する                        | 正常 |
| PC-12 | `formatEstimatedDiffMessage` の出力テンプレート                                            | `diff = {cheapestStoreId:'store-x', cheapestStoreName:'イオン', estimatedDiffYen:210}`                                                                                  | `formatEstimatedDiffMessage(diff)`                              | `'イオンの方が約210円安い'`               | 正常 |

#### 2-1-5. 縮退ケース一覧（設計書 §縮退ケース一覧 1〜9 の全件対応）

設計書の表を試験観点として 1 対 1 で対応させる（総額差・内訳をそれぞれ別関数呼び出しで検証するため、
ケース 1 のみ diff/breakdown で ID を分ける）。

| 設計書ケース# | ケース内容                                                            | 総額差の観点 ID | 内訳の観点 ID |
| ------------- | --------------------------------------------------------------------- | --------------- | ------------- |
| 1             | `productId` が `null`（手動追加品目）                                 | PC-13           | PC-14         |
| 2             | 商品が削除済み（`productId` が products に存在しない）                | PC-15（両方）   | PC-15         |
| 3             | 価格記録が 0 件                                                       | PC-16（両方）   | PC-16         |
| 4             | 換算可能な店舗が 1 件以下                                             | PC-17（両方）   | PC-17         |
| 5             | 必要量が `amountNote`（自由記述量）                                   | PC-18           | PC-18         |
| 6             | 単位区分が不一致（一部店舗のみ）で、一致する候補が 2 件未満に絞られる | PC-19（両方）   | PC-19         |
| 7             | 店舗削除で `storeName` が空文字                                       | PC-20（両方）   | PC-20         |
| 8             | 総額差が 0 円                                                         | PC-21           | —（対象外）   |
| 9             | 内訳の全店舗が同額                                                    | —（対象外）     | PC-22         |

| #     | 観点                                                                                | 前提                                                                                                                                      | 操作                                                                                 | 期待結果                                                                                                                      | 分類                       |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| PC-13 | 縮退#1: `productId` が `null` → 総額差なし                                          | `item.productId = null`。`product` は任意（`undefined` でも定義済みでもよい）                                                             | `estimateItemPriceDiff(item, product)`                                               | `null`                                                                                                                        | 境界                       |
| PC-14 | 縮退#1: `productId` が `null` → 内訳なし（呼び出し側は `product=undefined` を渡す） | `item.productId = null`（呼び出し元 `ShoppingItemRow` は `productMap.get` を呼ばず `product=undefined` にする設計のため、その状態を模す） | `buildStoreUnitPriceBreakdown(undefined)`                                            | `null`                                                                                                                        | 境界                       |
| PC-15 | 縮退#2: 商品削除済み（`productMap` に存在しない）→ 両方なし                         | `item.productId = 'deleted-product-id'`、`product = undefined`（`productMap.get` の未検出を模す）                                         | `estimateItemPriceDiff(item, undefined)` / `buildStoreUnitPriceBreakdown(undefined)` | 両方 `null`。例外を投げない（`shopping_items.product_id` に `references()` が無くカスケードされないための防御。§設計書手順3） | 異常（データ不整合の防御） |
| PC-16 | 縮退#3: `priceHistory` が 0 件 → 両方なし                                           | `product.priceHistory = []`                                                                                                               | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown`                             | 両方 `null`                                                                                                                   | 境界                       |
| PC-17 | 縮退#4: 換算可能な店舗が 1 件以下 → 両方なし                                        | `product.priceHistory` に候補 1 件のみ                                                                                                    | 同上                                                                                 | 両方 `null`                                                                                                                   | 境界                       |
| PC-18 | 縮退#5: `requiredAmount` が `null`（`amountNote` 品目）                             | `item.requiredAmount = null`, `item.amountNote = '適量'`。`product.priceHistory` に有効候補 2 件以上                                      | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown`                             | `estimateItemPriceDiff` は `null`。`buildStoreUnitPriceBreakdown` は非 `null`（`requiredAmount` に依存しないため）            | 境界                       |
| PC-19 | 縮退#6: 単位区分不一致で候補 2 件未満に絞られる → 両方なし                          | `item.requiredAmount.unit='kg'`（weight）。`product.priceHistory` = 店舗X（`g`, weight）+ 店舗Y（`ml`, volume）の 2 件                    | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown`                             | `estimateItemPriceDiff` は `null`（weight 候補が1件）。`buildStoreUnitPriceBreakdown` も基準区分に絞ると1件になり `null`      | 境界                       |
| PC-20 | 縮退#7: `storeName === ''` の記録は候補・内訳から除外される                         | `product.priceHistory` に店舗名が空文字の記録（削除済み店舗）を含む 3 件。有効な店舗は2件                                                 | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown`                             | 空文字店舗の記録が候補・内訳のどちらにも現れない。残り2件で通常どおり計算される                                               | 異常（データ不整合の防御） |
| PC-21 | 縮退#8: 総額差 1 位・2 位が同額（3 件中 2 件が同額を含む） → 非表示                 | 候補 3 件。`estimatedTotal` が `100円・100円・300円`（1位2位同額、3位は別値）になるよう記録を用意                                         | `estimateItemPriceDiff`                                                              | `null`（1位と2位の差が0円のため。3位との比較は行わない）                                                                      | 境界                       |
| PC-22 | 縮退#9: 内訳の全店舗が同額 → 全行「← 最安」                                         | 店舗3件すべて `unitPriceAmount` が同一                                                                                                    | `buildStoreUnitPriceBreakdown`                                                       | 全 `entries` が `isCheapest: true`, `diffFromCheapestYen: 0`                                                                  | 境界                       |

#### 2-1-6. 内訳（`buildStoreUnitPriceBreakdown`）固有の順序・基準ロジック

| #     | 観点                                                                                                     | 前提                                                                                                            | 操作                           | 期待結果                                                                                                                        | 分類 |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PC-23 | 店舗ごとに直近（`observedAt` 最大）の記録 1 件のみを候補にする                                           | 同一店舗に `observedAt` が異なる記録 2 件（古い/新しい）を含める。新しい方の `unitPriceAmount` を古い方と変える | `buildStoreUnitPriceBreakdown` | 新しい方の記録のみが候補に使われる（古い方の値が結果に混入しない）                                                              | 正常 |
| PC-24 | 同一店舗・同一 `observedAt` の重複は配列走査順で後に見つかった方を採用（実装補足の固定）                 | 同一店舗・同一 `observedAt` の記録 2 件を配列に順序を変えて含める                                               | `buildStoreUnitPriceBreakdown` | 配列内で**後方**にある記録の `unitPriceAmount` が採用される（決定的挙動の固定。設計書「実装時の技術的補足」）                   | 境界 |
| PC-25 | `entries` は `unitPriceAmount` 昇順、`diffFromCheapestYen` は `Math.round(unitPriceAmount - 最安値)`     | 候補 3 件、`unitPriceAmount` が非整数差（例: `50.3`, `62.1`, `70.9`）になるよう記録を用意                       | `buildStoreUnitPriceBreakdown` | `entries` が昇順に並び、最安の `diffFromCheapestYen=0`、他は四捨五入された差額（`Math.round` の丸め挙動を固定）                 | 正常 |
| PC-26 | `basisLabel` は最安記録の `kind` に基づく                                                                | `kind='weight'` / `'volume'` / `'other'`（`packageSizeUnit='個'`）の 3 パターンをそれぞれ用意                   | `buildStoreUnitPriceBreakdown` | `'100g'` / `'100ml'` / `` `1個` `` （`other` は基準記録自身の `packageSizeUnit` を使う）                                        | 正常 |
| PC-27 | `kind==='other'` の内訳比較は `packageSizeUnit` の完全一致を要求しない（PC-07 との対比・既知の限定事項） | PC-07 と**同一の product データ**（店舗X `'袋'` ／店舗Y `'パック'`、両方 `kind='other'`）を使う                 | `buildStoreUnitPriceBreakdown` | 非 `null`。店舗X・店舗Yの両方が `entries` に含まれる（総額差 PC-07 は `null` になる同一データで、内訳だけ表示される対比を固定） | 境界 |
| PC-28 | 店舗上限ちょうど 3 件のとき `entries` が 3 件返る（境界値）                                              | ADR-0013 の店舗上限どおり 3 件の有効候補                                                                        | `buildStoreUnitPriceBreakdown` | `entries.length === 3`                                                                                                          | 境界 |

#### 2-1-7. 防御性

Domain 層の Entity/VO ではないため、試験計画スキルの選択基準表では Presentation は防御性
「対象外」がデフォルトである。しかし本機能は例外的に適用対象とする: `productMap`
（`shopping-list-client.tsx` で `useMemo` により構築される単一の `ProductDto[]` 参照）が
**同一商品を参照する全ての `ShoppingItemRow` 間で共有される**ため、`estimateItemPriceDiff` /
`buildStoreUnitPriceBreakdown` が内部で `priceHistory` を破壊的に `sort` すると、無関係な
他の品目行の表示や後続レンダリングの計算結果に副作用が及ぶおそれがある。

| #     | 観点                                                                       | 前提                                                                            | 操作                                                                                                                | 期待結果                                                                                                               | 分類   |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| PC-29 | 防御的コピー: 呼び出し後も `product.priceHistory` の順序・内容が変わらない | `product.priceHistory` を昇順でない順序（未ソート）で用意し、参照を保持しておく | `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` を呼んだ**後**に元の `product.priceHistory` 配列を検査する | 呼び出し前後で配列の要素順・内容（参照同一性を含む）が変化しない（内部でソートする場合は複製した配列に対して行うこと） | 防御性 |
| PC-30 | 不正引数の伝搬: `product=undefined` を渡しても例外を投げない               | `product` に `undefined` を直接渡す                                             | `estimateItemPriceDiff(item, undefined)` / `buildStoreUnitPriceBreakdown(undefined)`                                | 例外を投げず `null` を返す（PC-15 の前提を単体の防御性観点として明示的に再掲）                                         | 防御性 |
| PC-31 | 境界値: `Math.round` の端数丸め（`x.5` 境界）                              | `estimatedTotal` の差がちょうど `.5`（例: `149.5` 差）になる候補を用意          | `estimateItemPriceDiff` の `estimatedDiffYen`                                                                       | JS の `Math.round` 仕様どおりに丸められる（`150`）。実装が独自の四捨五入ロジックに差し替わっていないことを固定         | 境界   |

### 2-2. `_components/store-unit-price-list.tsx`（`apps/web/tests/app/shopping-lists/_components/store-unit-price-list.test.tsx`）

DOM 環境（`include: ['tests/**/*.dom.test.ts', 'tests/**/*.test.tsx']`）。RTL で `<StoreUnitPriceList basisLabel={...} entries={...} />` を直接レンダリングする単体テスト。

| #      | 観点                                                                         | 前提                                                                                                                                                         | 操作   | 期待結果                                                 | 分類   |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------- | ------ |
| SUP-01 | 最安行に「← 最安」ラベルが表示される                                         | `entries` に `isCheapest: true` の行を含む                                                                                                                   | render | 該当行に「← 最安」が表示される                           | 正常   |
| SUP-02 | 非最安行に「+{差}円」ラベルが表示される                                      | `entries` に `isCheapest: false, diffFromCheapestYen: 45` の行を含む                                                                                         | render | 該当行に「+45円」が表示される                            | 正常   |
| SUP-03 | 各行に店舗名 + `${formatYen(unitPriceAmount)} / ${basisLabel}` が表示される  | `basisLabel='100g'`, `entries=[{storeName:'イオン', unitPriceAmount:298, ...}]`                                                                              | render | 「イオン」「298円 / 100g」に相当するテキストが表示される | 正常   |
| SUP-04 | 店舗上限ちょうど 3 行渡すと 3 行とも表示される（境界値）                     | `entries` に 3 件                                                                                                                                            | render | 3 行とも表示される（省略・切り捨てが発生しない）         | 境界   |
| SUP-05 | 通常ケース: 2 行渡すと 2 行のみ表示される                                    | `entries` に 2 件                                                                                                                                            | render | 2 行のみ表示される                                       | 正常   |
| SUP-06 | 複数行が同額のとき、該当行すべてに「← 最安」が表示される（縮退#9の表示確認） | `entries` 3 件すべて `isCheapest: true`                                                                                                                      | render | 3 行とも「← 最安」が表示される                           | 境界   |
| SUP-07 | 防御性: `entries` が空配列でも例外を投げない                                 | `entries = []`（`buildStoreUnitPriceBreakdown` は通常 2 件未満で `null` を返すため呼び出し元からは渡らない想定だが、コンポーネント単体としての防御性を確認） | render | 例外を投げず、行が 0 件描画される                        | 防御性 |

---

## 3. 結合試験観点

`price-comparison.ts` の計算結果が実際のコンポーネント分岐・描画へ正しくつながることを、
実データに近い `ProductDto` / `PriceRecordDto` を使って確認する。

### 3-1. `shopping-item-row.tsx`（既存: `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx` に追記）

既存 ID は IR-01〜IR-24（IR-15/16 含む）。新規観点は IR-25 から採番する。

| #     | 観点                                                                                          | 前提                                                                                                                                 | 操作   | 期待結果                                                                                                        | 分類   |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------- | ------ |
| IR-25 | 総額差行の表示条件（priceDiff !== null）                                                      | `productMap` に対象商品を含め、2 店舗以上の換算可能な価格記録を用意（`estimateItemPriceDiff` が非 null になるデータ）                | render | 「◯店の方が約△円安い」のテキストが本文列に表示される                                                            | 正常   |
| IR-26 | 総額差行が非表示（priceDiff === null）                                                        | `item.productId = null`（手動追加品目）                                                                                              | render | 「円安い」を含むテキストが存在しない                                                                            | 境界   |
| IR-27 | 未購入品目でも `hasBreakdown` なら展開トリガーが表示される（P-4）                             | `item.status='pending'`, `readOnly=false`, `productMap` に breakdown が非 null になる商品を紐付け                                    | render | 「店舗別の単価を見る」ボタンが表示される                                                                        | 正常   |
| IR-28 | 未購入かつ `hasBreakdown=false` なら展開トリガーは表示されない                                | `item.status='pending'`, `productMap` が空（`hasBreakdown=false`）                                                                   | render | 「店舗別の単価を見る」「金額を記録」いずれも表示されない                                                        | 境界   |
| IR-29 | bought かつ `hasBreakdown=false` でも従来どおり「金額を記録」が表示される（回帰・独立性確認） | `item.status='bought'`, `productMap` が空                                                                                            | render | 「金額を記録」ボタンが表示される（既存 IR-12 の回帰を、`hasBreakdown` 無関係であることまで明示）                | 正常   |
| IR-30 | bought かつ `hasBreakdown=true` のときラベルは「金額を記録」が優先される                      | `item.status='bought'`, `productMap` に breakdown が非 null になる商品を紐付け                                                       | render | 「金額を記録」が表示され、「店舗別の単価を見る」は表示されない                                                  | 正常   |
| IR-31 | `readOnly=true` かつ未購入かつ `hasBreakdown=true` でもトリガーは表示されない                 | `item.status='pending'`, `readOnly=true`, breakdown 非 null                                                                          | render | 「店舗別の単価を見る」ボタンが表示されない（既存 IR-18 の bought 限定版を未購入側にも拡張）                     | 境界   |
| IR-32 | 未購入 + 展開時、内訳のみの読み取り専用パネルが表示される（`PurchaseInputForm` は出ない）     | `item.status='pending'`, `expanded=true`, breakdown 非 null                                                                          | render | `StoreUnitPriceList` 相当の内訳が表示され、「購入を記録」ボタン（`PurchaseInputForm` 由来）は表示されない       | 正常   |
| IR-33 | 未購入 + 展開時 + `hasBreakdown=false` は展開パネル自体が表示されない（防御的分岐）           | `item.status='pending'`, `expanded=true`, breakdown が `null` になるデータ（親の `expandedItemId` 経由で理論上到達しうる状態を模す） | render | 内訳パネル・`PurchaseInputForm` のどちらも表示されない                                                          | 防御性 |
| IR-34 | 未購入品目の「店舗別の単価を見る」click で `onToggleExpand` が呼ばれる                        | `item.status='pending'`, breakdown 非 null                                                                                           | click  | `onToggleExpand(item.id)` が呼ばれる（既存 IR-14 の未購入版）                                                   | 正常   |
| IR-35 | `productMap` 経由の実データが総額差・内訳の両方に反映される（結合の要）                       | PC-01 相当の実データ（2 店舗、換算可能）を `productMap` に設定                                                                       | render | 総額差テキストと内訳（展開後）の両方が、`price-comparison.ts` の計算結果どおりに表示される                      | 正常   |
| IR-36 | `productId` が `null` のとき `productMap` に何を渡してもトリガー・総額差行が出ない            | `item.productId = null`, `productMap` に無関係の商品データを大量に含める                                                             | render | 総額差行・展開トリガーとも表示されない（縮退#1 の行レベル確認）                                                 | 境界   |
| IR-37 | 推奨店舗バッジと最安店舗（総額差）の食い違いを許容する（P-2）                                 | `item.targetStoreId` が最安ではない店舗を指す。総額差の最安店舗はそれと異なる店舗                                                    | render | 店舗バッジには `targetStoreId` の店舗名が、総額差の文言には別の（実際に安い）店舗名が**両方独立して**表示される | 正常   |

### 3-2. `purchase-input-form.tsx`（既存: `apps/web/tests/app/shopping-lists/_components/purchase-input-form.test.tsx` に追記）

既存 ID は PF-01〜PF-08（+ 無 ID 2 件）。新規観点は PF-09 から採番する。

| #     | 観点                                                                                   | 前提                                                              | 操作     | 期待結果                                                                                                     | 分類 |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | ---- |
| PF-09 | `breakdown` が `null` のとき内訳セクションが表示されない                               | `breakdown={null}`                                                | render   | 「店舗別の単価」見出しが表示されない                                                                         | 境界 |
| PF-10 | `breakdown` が非 `null` のとき内訳が価格・店舗入力欄の後（ボタン行の直後）に表示される | `breakdown` に 2 件以上の `entries`                               | render   | 「店舗別の単価」見出し + `StoreUnitPriceList` が、既存の価格・店舗入力欄より後（ボタン行の直後）に表示される | 正常 |
| PF-11 | 回帰: `breakdown` 追加後も既存の価格・店舗入力挙動が変化しない                         | 既存 PF-01〜PF-08（+ 無 ID 2 件）を `breakdown=null` 付きで再実行 | 既存操作 | 既存アサーションが全て変化なく成立する                                                                       | 回帰 |

### 3-3. `store-group.tsx`（既存: `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx` に追記）

既存 ID は SG-01〜SG-07。新規観点は SG-08 から採番する。

| #     | 観点                                                         | 前提                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 操作   | 期待結果                                                                 | 分類               |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ | ------------------ |
| SG-08 | `productMap` が `ShoppingItemRow` まで中継される（中継確認） | `productMap` に breakdown/priceDiff が非 null になる商品を含める                                                                                                                                                                                                                                                                                                                                                                                                                              | render | 対象品目の行に総額差テキストが表示される（中継漏れがあれば表示されない） | 正常               |
| SG-09 | 回帰・注記: 既存 SG-04「金額差表示が存在しない」の意味論     | SG-04 は `renderStoreGroup()` のデフォルト（`items` に `productId:null` のみ）で「円安い」が無いことを確認している。本機能導入後もこのデフォルトでは `productId` が `null` のため引き続き非表示になり**テスト自体は落ちない**が、テスト名・コメントが指す「S-6 案A・スコープ確認」という前提は本機能で変わる（productId 紐付き品目では表示される）。実装時に SG-04 のコメント・テスト名を「productId が null のときは表示されない」に更新することを推奨する（コード変更を伴うため実装者判断） | —      | 既存アサーションは変化しないが、テストの意図を表す文言の更新が必要       | 回帰（意味論確認） |

### 3-4. `shopping-list-client.tsx`（既存: `shopping-list-client.*.test.tsx` に追記）

既存 ID は LC-01〜LC-28（ファイルは `.view` / `.checked` / `.complete` / `.remove` / `.sync` に分割）。
新規観点は LC-29 から採番し、`.view.test.tsx` または新規 `.pricing.test.tsx`（`productMap` 中継・展開状態遷移に特化）への配置を想定する。

| #     | 観点                                                                                                                                        | 前提                                                                                                      | 操作                                                | 期待結果                                                                                                                       | 分類   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| LC-29 | `products` prop → `productMap` 構築 → 末端の `ShoppingItemRow` まで届く（結合、設計書「1〜2ケース」に対応）                                 | `products` に対象商品を含めて `<ShoppingListClient shoppingList=... stores=... products=... />` を render | render                                              | 対象品目の行に総額差・（展開後）内訳が表示される                                                                               | 正常   |
| LC-30 | `products` が空配列でも例外なく描画される（境界値・商品未登録時）                                                                           | `products=[]`                                                                                             | render                                              | 例外を投げず、全品目で総額差行・展開トリガー（未購入分）が非表示のまま描画される                                               | 境界   |
| LC-31 | 未購入品目の内訳パネルを開いた状態でチェックすると `expandedItemId` が保持されたまま `PurchaseInputForm` に切り替わる（P-4 の核心シナリオ） | `item.status='pending'`, breakdown 非 null。「店舗別の単価を見る」で展開済み                              | チェックボタンを click（`handleSetChecked(true)`）  | 同じ行が開いたまま、内訳のみの読み取り専用パネルから `PurchaseInputForm`（内訳セクション込み）に切り替わる。パネルごと閉じない | 正常   |
| LC-32 | 回帰: bought 品目でチェックを外すと `expandedItemId` がリセットされパネルごと閉じる（breakdown 有りでも成立）                               | `item.status='bought'`, breakdown 非 null。「金額を記録」で展開済み                                       | チェックボタンを click（`handleSetChecked(false)`） | 既存 LC-26 と同じくパネルが閉じる（breakdown の有無に関わらず既存動作が保たれることを明示）                                    | 回帰   |
| LC-33 | 整合性: `handleReassignStore`（店舗再割当）は総額差・内訳の表示内容に影響しない                                                             | 総額差・内訳が表示されている品目に対し `targetStoreId` を変更                                             | 店舗バッジから別店舗を選択                          | 総額差の文言・内訳の内容（`productId`/`priceHistory` 由来）が変化しない（設計書§データフローの明記どおり）                     | 整合性 |
| LC-34 | 回帰: 既存のフォーカス復帰 refetch（LC-14）は `products` を再取得しない                                                                     | LC-14 と同じ前提に `products` を追加                                                                      | `window.dispatchEvent(new Event('focus'))`          | `items` は refetch されるが、`products`/`productMap` 由来の表示（総額差・内訳）は refetch 前後で変化しない                     | 回帰   |

---

## 4. 特性観点

| 区分               | 適用                                       | 内容                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 権限               | **対象外**                                 | 認証・認可の変更なし。MVP1 は認証なし・2 名限定運用のまま（設計書§セキュリティ）。`GetProductsUseCase` 自体のアクセス制御は本タスクの変更範囲外。                                                                                                                                                                                                                                                   |
| データ整合性       | 適用                                       | PC-15/PC-20（商品削除・店舗削除後の防御的縮退）、IR-37（推奨店舗バッジと最安店舗の食い違い許容）、LC-33（店舗再割当が価格計算に影響しないこと）。                                                                                                                                                                                                                                                   |
| 冪等性             | **対象外**                                 | 本機能は読み取り専用の表示計算であり、新規の書き込み操作（POST 等）を追加しない。既存の書き込みフロー（チェック・購入記録・店舗再割当）の冪等性は本タスクの変更範囲外で、既存テスト（LC-18「連打しても bought.$post は1回のみ」等）がそのまま回帰確認を担う。                                                                                                                                       |
| 障害系（外部 I/O） | **対象外**                                 | 新規の外部 I/O（DB 以外の外部 API・ストレージ）なし。`GetProductsUseCase.execute()` が DB エラーで例外を投げた場合の扱いは既存の `catch (ShoppingListNotFoundError)` 以外は再 throw というパターンをそのまま踏襲し、新規のリトライ・タイムアウト設計はない（設計書§エラー処理）。`[id]/page.tsx` 自体の自動テストが本リポジトリに前例なく（§0 参照）、この経路は型チェック + 実画面確認で代替する。 |
| フロントエンド固有 | 適用（**必須**）                           | §3 の IR-25〜37・LC-29〜34 が該当（条件付き表示・トリガー分岐・ラベル出し分け・展開パネルの分岐）。本機能は新規の非同期書き込みを伴わないため、ローディング状態・楽観的更新ロールバックの新規観点はない（既存の書き込みフローの該当観点は回帰試験範囲でカバー）。                                                                                                                                   |
| 防御性             | 適用（**例外的に必須**。理由は§2-1-7参照） | PC-27/PC-29/PC-30、SUP-07、IR-33、IR-36。通常 Presentation 層では対象外だが、`productMap` が複数コンポーネント間で共有される可変オブジェクト（`priceHistory` 配列を含む）であるため、破壊的操作の有無・不正入力（`undefined`）への耐性を検証する。                                                                                                                                                  |

---

## 5. メソッド網羅チェック表

実装コードから列挙した全 public メソッド/コンポーネントと、対応する試験観点 No の対照表。

| ファイル                                | 公開シンボル                                                         | 対応する試験観点 No                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `_utils/price-comparison.ts`            | `estimateItemPriceDiff`                                              | PC-01〜PC-09, PC-13, PC-15〜PC-21, PC-29〜PC-31                                                                            |
| `_utils/price-comparison.ts`            | `buildStoreUnitPriceBreakdown`                                       | PC-14〜PC-18, PC-20, PC-22〜PC-30                                                                                          |
| `_utils/price-comparison.ts`            | `formatEstimatedDiffMessage`                                         | PC-12                                                                                                                      |
| `_utils/price-comparison.ts`            | `formatYen`                                                          | PC-10, PC-11                                                                                                               |
| `_utils/price-comparison.ts`            | `unitBasis`（非公開）                                                | PC-05, PC-06（間接検証。外部非公開のため直接呼び出しのテストは書かない）                                                   |
| `_components/store-unit-price-list.tsx` | `StoreUnitPriceList`                                                 | SUP-01〜SUP-07                                                                                                             |
| `_components/shopping-item-row.tsx`     | `ShoppingItemRow`（Props に `productMap` 追加）                      | IR-25〜IR-37（新規） + IR-01〜IR-24（既存・回帰）                                                                          |
| `_components/purchase-input-form.tsx`   | `PurchaseInputForm`（Props に `breakdown` 追加）                     | PF-09〜PF-11（新規） + PF-01〜PF-08（既存・回帰）                                                                          |
| `_components/store-group.tsx`           | `StoreGroup`（Props に `productMap` 追加）                           | SG-08〜SG-09（新規） + SG-01〜SG-07（既存・回帰）                                                                          |
| `_components/shopping-list-client.tsx`  | `ShoppingListClient`（Props に `products` 追加）                     | LC-29〜LC-34（新規） + LC-01〜LC-28（既存・回帰）                                                                          |
| `[id]/page.tsx`                         | `ShoppingListDetailPage`（default export）                           | 対象外（§0・§4「障害系」参照。本リポジトリに page.tsx 単体の自動テスト前例なし。型チェック + 実画面確認 MB-01〜06 で代替） |
| `packages/application`                  | `GetShoppingListUseCase` / `GetStoresUseCase` / `GetProductsUseCase` | 対象外（無変更・既存 UseCase をそのまま利用。設計書§バックエンド設計）                                                     |

---

## 6. 回帰試験範囲

### 6-1. 動作の回帰（既存テストの再実行で確認する範囲）

- **既存の「金額を記録」導線**: `shopping-item-row.test.tsx` の IR-12（bought 品目に「金額を記録」表示）・
  IR-13（pending 品目に非表示）・IR-14（click で `onToggleExpand`）・IR-18（readOnly で非表示）が、
  展開トリガー条件を `bought && !readOnly` から `(bought || hasBreakdown) && !readOnly` に広げた後も
  従来どおり成立すること。IR-29/IR-30（新規）で `hasBreakdown` の有無に関わらず bought 側のラベルが
  変わらないことを追加確認する。
- **`PurchaseInputForm` の入力ロジック**: `purchase-input-form.test.tsx` の PF-01〜PF-08（価格プレフィル・
  実購入店舗の初期値優先順位・送信可否・0 円送信・キャンセル・submitting 制御）が、`breakdown` prop 追加後も
  無変化であること（PF-11 で明示的に回帰確認）。
- **`handleSetChecked` によるチェック解除時の `expandedItemId` リセット**: `shopping-list-client.checked.test.tsx` の
  LC-26（チェックを外すと展開中の金額フォームが閉じる）が、`productMap`/breakdown 導入後も成立すること
  （LC-32 で breakdown 有りの品目でも再確認）。さらに設計書§データフローが明示する新規の遷移（LC-31: 未購入の
  内訳パネル展開中にチェックを入れると `expandedItemId` が保持されたまま `PurchaseInputForm` に切り替わる）を追加する。
- **`store-group.tsx` の中継・グルーピングロジック**: SG-01〜SG-07（推奨店舗バッジ・グルーピング・中継確認）が
  `productMap` 追加後も無変化であること。
- **`shopping-list-client.tsx` の他の書き込みフロー**: 手動追加（LC-09/10）・削除（`.remove.test.tsx`）・
  完了/再開（`.complete.test.tsx`）・献立同期（`.sync.test.tsx`）は本タスクの変更対象外ファイル・ロジックであり、
  `products` prop の追加のみが影響しうる（型シグネチャ変更、§6-2 参照）。ロジック自体への回帰観点は無いが、
  既存テストは全件再実行して意図しない副作用が無いことを確認する。

### 6-2. 型シグネチャ変更に伴う既存テストの必須更新（実装時に対応が必要な箇所の特定）

以下は Props の必須項目追加（`productMap` / `breakdown` / `products`）により、**実装後に型エラーで
壊れる既存テストファイル**の一覧。試験計画としてはコードを変更しないため実装しないが、実装者が見落とさないよう
明示する。

| 既存テストファイル                                                                     | 影響箇所                                                                                | 必要な対応                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`             | `renderRow()` ヘルパーの `defaults`                                                     | `productMap`（例: 空 `Map`）をデフォルトに追加    |
| `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`                   | `renderStoreGroup()` ヘルパーの `defaults`                                              | `productMap`（例: 空 `Map`）をデフォルトに追加    |
| `apps/web/tests/app/shopping-lists/_components/purchase-input-form.test.tsx`           | 各 `render(<PurchaseInputForm .../>)` 呼び出し（PF-01〜PF-08 + 無 ID 2 件、計 10 箇所） | `breakdown={null}` を追加                         |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.view.test.tsx`     | 全 `<ShoppingListClient shoppingList=... stores=... />` 呼び出し                        | `products={[]}`（または対象商品を含む配列）を追加 |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`  | 同上                                                                                    | 同上                                              |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.complete.test.tsx` | 同上                                                                                    | 同上                                              |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.remove.test.tsx`   | 同上                                                                                    | 同上                                              |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`     | 同上                                                                                    | 同上                                              |

これらの更新自体は実装者（implementer）の作業だが、**この一覧を実装計画・レビューで見落とすと
`pnpm type-check` が既存テストで失敗する**ため、試験計画としてここに固定する。

### 6-3. 意味論の陳腐化（テストは通るが意図が古くなる箇所）

- `store-group.test.tsx` SG-04「金額差表示が存在しない（S-6 案A・スコープ確認）」: §3-3 SG-09 参照。
  テスト自体は落ちないが、コメント・テスト名が指す前提（S-6 案A＝金額差は一切表示しない）は本機能で
  部分的に覆るため、更新を推奨する。

### 6-4. 回帰確認の対象外（変更ファイルに含まれないため）

- `add-item-form.test.tsx` / `complete-shopping-panel.test.tsx`: `ShoppingItemRow` / `PurchaseInputForm` を
  使用しない独立コンポーネントであり、Props 変更の影響を受けない（確認済み・grep で `ShoppingItemRow` の
  参照なしを確認）。
- `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`: `shopping-list-view.ts` は
  設計書§変更後構成で「変更なし」と明記されており、`price-comparison.ts` とはファイルが分離しているため
  無影響。
- `apps/web/tests/app/products/**`: products 側 `formatUnitPrice` 等は設計書§対象外で無変更。

---

## 7. 実画面確認（390px。実装後に実施）

manual-browser-verify スキルで、Chrome DevTools のモバイルエミュレーション幅 390px を用いて確認する。
各項目に ID を振り、PASS の判定基準を明記する。

| ID    | 確認項目                                                                                         | 見る場所                                   | PASS の基準                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | 総額差の行（「◯店の方が約△円安い」）が本文列で折り返し・はみ出しなく収まる                       | 品目カードの本文列（3 カラム構造の中央列） | 店舗名が長い（例: 6〜8 文字）場合も含め、横スクロール・文字の見切れが発生しない。既存の `w-28` 固定幅店舗バッジの列を圧迫しない |
| MB-02 | 未購入品目の「店舗別の単価を見る」展開パネルが、他の展開状態と競合しない                         | 品目一覧（複数品目を展開操作）             | `expandedItemId` の既存仕様どおり同時に開くのは 1 行のみ。ある行を開くと別の行（bought/未購入問わず）が自動的に閉じる           |
| MB-03 | 展開パネル内の `StoreUnitPriceList`（最大 3 行）が店舗名・金額・差額ラベルとも折り返さず読める   | 展開パネル内の内訳リスト                   | 3 店舗分表示しても行が潰れず、金額・「← 最安」/「+◯円」ラベルが読める                                                           |
| MB-04 | bought 品目の展開パネル（`PurchaseInputForm`）に内訳セクションが追加されても既存入力欄が崩れない | bought 品目の展開パネル                    | 価格入力・実購入店舗セレクトが縦につぶれず操作可能。内訳セクションはボタン行の下に区切り線付きで表示される                      |
| MB-05 | 品目カードの縦幅が伸びても既存の 3 カラム構造・チェックボタン・削除ボタンの位置が崩れない        | 品目カード全体                             | チェックボタン・削除ボタンの位置・タップ領域が既存と同じ（総額差行・展開トリガー追加による横方向のレイアウト崩れがない）        |
| MB-06 | 価格差・内訳の対象外品目（`productId` が `null` 等）は従来どおりのレイアウトのまま               | 手動追加品目のカード                       | 余計な空行・ガタつきが無く、既存（本機能導入前）と見た目が変わらない                                                            |

---

## 8. E2E の要否

**任意（本タスクでは実施しない）。**

理由:

- RTL による結合テスト（§3。`productMap` の中継から実際の分岐・描画までを実データで確認する IR-35 等）と、
  実装後必須の実画面確認（§7 MB-01〜06）で、ユーザーが実際に目にする振る舞いの粒度は十分にカバーされる。
- 新規 API・DB スキーマ変更・認証認可の変更が無く（設計書§対象範囲）、E2E でのみ検出できるバックエンド結合の
  リスクが小さい。
- 既存の Playwright 基盤（`apps/web/tests/e2e/`）は `recipe-crud.smoke.spec.ts` 1 本のみで、機能追加ごとに
  E2E を追加する運用にはなっていない（既存の運用パターンを踏襲）。

将来 `GetProductsUseCase` のレスポンス肥大化（設計書 R-2）でページング API 化する場合など、
バックエンド結合が新たに増える変更では改めて要否を判断すること。

---

## 9. 試験データ

### 9-1. 共有フィクスチャの拡張（設計書§テスト方針に明記）

`apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts` に以下を追加する
（既存の `createStoreDto` / `createShoppingItemDto` と同じパターン）。

```typescript
export function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-1',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 250,
    unitPriceAmount: 50,
    packageSizeValue: 500,
    packageSizeUnit: 'g',
    observedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-1',
    name: '醤油',
    aliases: [],
    category: 'seasoning',
    defaultUnit: 'ml',
    priceHistory: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}
```

`ProductCategory` の実際の許容値は `packages/domain` を要確認（本試験計画では固定しない。実装時に
既存の `create-product` テスト等から実在するカテゴリ値を採用すること）。

### 9-2. 既存テストファイルとの整合性に関する注記（実装者向け）

`shopping-item-row.test.tsx` / `purchase-input-form.test.tsx` / `store-group.test.tsx` は、
共有フィクスチャ（`shopping-list-test-fixtures.ts`）を import せず、ファイル内にローカルで
`createStoreDto` / `createShoppingItemDto` を重複定義している（既存の状態。本試験計画のスコープでは
是正しない）。新規の `productMap` / `breakdown` 関連テストデータをこれらのファイルに追加する際、
共有フィクスチャの `createProductDto` / `createPriceRecordDto` を import するか、既存の慣行に倣い
ローカルに複製するかは実装者の判断とする（依頼スコープ外のリファクタリングであるここでの統一は行わない）。

### 9-3. 4 方向テストの固定値（再掲・改変禁止）

§2-1-1 の PC-01〜PC-04 で使用する `0.3kg`/`500g`/`¥250`、`300g`/`1kg`/`¥500`、`2l`/`500ml`/`¥100`、
`2000ml`/`1l`/`¥200` の組み合わせは設計書の固定例であり、実装・レビューを通じて改変しない。

---

## 10. 完了条件

- §2（PC-01〜PC-31, SUP-01〜07）・§3（IR-25〜37, PF-09〜11, SG-08〜09, LC-29〜34）の全観点が実装され green。
- §5 メソッド網羅チェック表の全 public シンボルに対応する試験観点があり、非公開の `unitBasis` も
  間接検証の観点（PC-05, PC-06）を持つ。
- §2-1-5 の縮退ケース対応表（設計書 1〜9 の全ケース）に漏れなく試験観点が対応している。
- PC-01〜PC-04（単位換算 4 方向テスト）が設計書の固定値を改変せず反映されており、`recordBasis`/`requiredBasis`
  取り違えを検出できる構成（コントロール店舗によるコントロール／実量一致性による `null` アサート）になっている。
- 既存 IR-01〜24 / PF-01〜08（+ 無 ID 2 件）/ SG-01〜07 / LC-01〜28 が全て回帰なく PASS する
  （§6-2 の型シグネチャ更新を実装側で反映した上で）。
- §6-3 の意味論陳腐化（SG-04）について、実装者がコメント・テスト名の更新要否を判断し記録している。
- §7 の実画面確認 MB-01〜06 が実装後に実施され PASS している。
- `pnpm lint` / `pnpm type-check` / `pnpm test`（`apps/web` の該当テスト）が通る。
- 新規テストファイルのパスが vitest の `include`（node: `tests/**/*.node.test.ts`、dom: `tests/**/*.test.tsx`）
  と整合している（§2-1 冒頭で確認済み）。
- 特性観点表（§4）で「対象外」とした区分（権限・冪等性・障害系）に理由が明記され、「適用」区分
  （データ整合性・フロントエンド固有・防御性）に対応する観点がある。
