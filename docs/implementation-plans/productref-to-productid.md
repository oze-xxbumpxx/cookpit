# 実装計画: productref-to-productid

- 前提となる設計書: docs/designs/productref-to-productid.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 設計判断は ADR-0010 案 D / ADR-0011 で確定済み。変更ファイルが限定的で対話的修正が向く。

## ステップ 1: Domain

### 対象ファイル

- `packages/domain/src/recipe/recipe-ingredient.ts`
- `packages/domain/src/recipe/recipe-ingredient.test.ts`
- `packages/domain/src/index.ts`（ProductRef が明示 export されていないことの確認）

### 変更内容

1. `export interface ProductRef` を削除する。
2. `productRef` の型を `ProductId | null` にする（`import type` ではなく値 import が必要な場合は
   `ProductId` を `../product/product-id` から import）。
3. コメントを「集約間は ID 参照のみ」に合わせて更新する。
4. テストの `{ value: 'prod-1' }` を `ProductId.fromString('prod-1')` に置き換える。
5. `productRef` が `ProductId` であることを確認する観点を 1 件追加する。

### 完了条件

- domain の type-check / test PASS。
- リポジトリ全体で `ProductRef` 識別子が 0 件（docs の歴史記述を除くコード）。

## ステップ 2: Application / Infrastructure

### 対象ファイル

- `packages/application/src/recipe/recipe.mapper.ts`
- `packages/application/src/recipe/recipe.mapper.test.ts`
- `packages/application/src/shopping-list/ingredient-aggregation.ts`
- `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`

### 変更内容

1. mapper / repository の組み立てを `ProductId.fromString(...)` に変更する。
2. `ingredient-aggregation` の冗長な `fromString(productRef.value)` を
   `ingredient.productRef` の直接利用に置き換える。
3. mapper テストの構造的リテラルを `ProductId.fromString` に追随する。

### 完了条件

- application / infrastructure の type-check / test PASS。
- API 契約テスト（api-contract）は無変更で PASS。

## ステップ 3: ドキュメント

### 対象ファイル

- `docs/decisions/ADR-0010-package-public-boundary.md`（案 D を ADR-0011 へ誘導）
- `docs/04-domain-model.md`（実装との差分があれば注記のみ。本文は既に ProductId）
- 本設計書・試験計画・本実装計画

### 完了条件

- ADR-0010 から ADR-0011 へのポインタがある。
- `pnpm lint` / `type-check` / `test` 全 PASS。

## テスト計画との対応

- docs/tests/productref-to-productid.md の D-_ / A-_ / I-\* を各ステップで満たす。

## リスクとロールバック

- 型エラーの取りこぼし → 全パッケージ type-check。
- ロールバックはコミット単位の `git revert`（データ移行なし）。

## ドキュメント更新対象

- ADR-0011（新規）
- ADR-0010（案 D のステータス追記）
- docs/designs / implementation-plans / tests（本 feature）
