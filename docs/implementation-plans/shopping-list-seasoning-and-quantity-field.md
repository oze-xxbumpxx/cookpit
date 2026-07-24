# 実装計画: 調味料の買い物リスト除外 ＋ 数量・単位の統合入力欄

対象設計書: `docs/designs/shopping-list-seasoning-and-quantity-field.md`（L2）

## ステップ

### S1. Domain: 調味料判定（要望1）

- 新規 `packages/domain/src/shared/seasoning.ts`
  - `isSeasoningName(name: string): boolean`。NFKC+trim 正規化。完全一致語セット＋部分一致語セット。
  - `packages/domain/src/index.ts` から re-export（必要なら）。
- 新規 `packages/domain/src/shared/seasoning.test.ts`
- 完了条件: 完全一致・部分一致・誤検出防止・正規化のテストが緑。

### S2. Application: 集計から調味料を除外（要望1）

- `packages/application/src/shopping-list/ingredient-aggregation.ts`
  - `aggregateIngredients`（個別・集約の両分岐）で `isSeasoningName(ingredient.displayName)` を
    スキップ。展開直後に判定して調味料を集計に載せない。
- テスト更新: `shopping-list-use-cases.test.ts` に調味料除外ケースを追加
  （generate / sync 双方でレシピの調味料材料が ShoppingItem 化されないこと）。
- 完了条件: application テスト緑。既存の集計・在庫引き算の挙動は非調味料で不変。

### S3. Web: パースユーティリティ＋共通コンポーネント（要望2）

- 新規 `apps/web/src/lib/parse-quantity.ts` … `parseQuantity` と型 `ParsedQuantity`。
- 新規 `apps/web/src/lib/parse-quantity.test.ts`
- 新規 `apps/web/src/components/ui/quantity-field.tsx` … 1 欄入力＋datalist 候補。
  - props: `id`, `value`, `onValueChange`, `placeholder?`, `className?`, `invalid?`, `describedBy?`。
- 新規 `apps/web/src/components/ui/quantity-field.test.tsx`

### S4. Web: 各フォームを統合入力へ置換（要望2）

- `add-item-form.tsx`（買い物リスト手動追加）: 数量+単位 → `QuantityField` 1 欄。
  `parseQuantity` で `amount` のみ受理。canSubmit / onAdd を調整。
- `add-stock-form.tsx`（在庫追加）: 同上（value>0）。
- `price-record-form.tsx`（内容量）: 内容量+単位 → 1 欄。`amount`（value>0）受理。
- `ingredient-row.tsx` + `build-ingredient-input.ts`（レシピ材料）:
  量+単位 → 分量 1 欄。`amount`→amountValue/Unit、非数値→amountNote。`IngredientRowValue` の
  `amountText`/`amountUnit` を単一 `amountText`（分量）へ集約。
- 各既存テスト更新: `add-item-form.test.tsx` / `add-stock-form.test.tsx` /
  `price-record-form.test.tsx` / `ingredient-row.test.tsx` / `recipe-form-fields.test.tsx` /
  `build-ingredient-input`（該当あれば）/ recipe form client 系のスナップショット的テスト。

### S5. 品質ゲート

- `pnpm type-check` / `pnpm lint` / `pnpm test`（domain / application / api-contract / infra / web）。
- 変更パッケージのテストを追加・実行。

## リスク・留意

- 調味料判定は誤検出/取りこぼしがあり得る（設計で許容）。リストは拡張容易に保つ。
- 統合入力のパースは「先頭数値＋単位」に固定。`大さじ2` のような単位先行表記はレシピでは
  note 扱いになる（数量集計には乗らない）。仕様として許容。
- 単位のみのフォーム（商品基本単位）は対象外（回帰なし）。

## ロールバック

- 各ステップは層ごとにコミット分割。要望1（domain+application）と要望2（web）は独立しており、
  片方のみ revert 可能。
