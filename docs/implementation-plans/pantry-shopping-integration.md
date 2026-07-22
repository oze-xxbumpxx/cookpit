# 実装計画: pantry-shopping-integration（在庫引き算連携）

- 対象設計書: `docs/designs/pantry-shopping-integration.md`（確定）
- レベル: L2 / Sprint 5 Unit C
- 実装ルート: Orchestrator 経路（メイン直接指揮 + implementer）

## 変更対象ファイル

| #   | ファイル                                                                    | 変更内容                                                     |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `packages/domain/src/shared/unit.ts`                                        | `isCountableUnit(unit: Unit): boolean` を新規 export         |
| 2   | `packages/domain/src/shared/unit.test.ts`                                   | `isCountableUnit` のテスト（新規ファイル）                   |
| 3   | `packages/application/src/shopping-list/generate-shopping-list.use-case.ts` | `PantryRepository` 注入・差し引き/消費ロジック追加           |
| 4   | `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`    | `InMemoryPantryRepository` 追加・在庫引き算シナリオ追記      |
| 5   | `apps/web/src/server/routes/shopping-lists.ts`                              | `GenerateShoppingListUseCase` へ `pantryRepository()` を注入 |

## ステップ

### Step 1: domain `isCountableUnit`

- `unit.ts` に数えられる単位集合（`個/本/枚/玉/尾/切れ/束/袋/缶`）を持つ predicate を追加。
- 実装は `Set<Unit>` + `has`。連続量（`g/kg/ml/l/大さじ/小さじ/cup/合`）は false。
- 完了条件: `unit.test.ts` が 17 単位を網羅して PASS。

### Step 2: UseCase に差し引き/消費を実装

- コンストラクタに `private readonly pantryRepository: PantryRepository` を追加（第 5 引数）。
- `execute()` の `created: true` パス（`aggregated` 決定後・`items` 生成前）に在庫引き算を挿入:
  - `pantry = await this.pantryRepository.find()` を取得。
  - 新規 private メソッド `applyPantryDeduction(aggregated, pantry)` で設計書§差し引きアルゴリズムを実行し、
    「出力する `ResolvedIngredient[]`（買う量に調整済み）」を返す。副作用として `pantry` の Stock を消費する。
  - 差し引き後の配列から `ShoppingItem` を生成。
- 永続化順序（設計書 D-7）: `shoppingListRepository.save()` → `pantryRepository.save(pantry)` → `mealPlan.transitionTo('shopping')` + `save()`。
- 冪等パス（`existing !== null`）は在庫消費を行わない（既存コードのまま）。
- JSDoc に在庫消費の副作用・冪等時の非消費を追記（`@throws` は既存を維持）。
- 完了条件: type-check PASS。

### Step 3: DI 配線

- `apps/web/src/server/routes/shopping-lists.ts` の `new GenerateShoppingListUseCase(...)` に
  `pantryRepository()` を第 5 引数として追加（import 済み・追加 import 不要）。

### Step 4: テスト

- `InMemoryPantryRepository`（`find()`/`save()`）を test に追加。`generateUseCase()` に注入。
- 設計書§テスト観点の Application 9 シナリオを追記。既存の生成テスト（在庫なし相当）が回帰しないことを確認。

### Step 5: 品質ゲート

- `pnpm lint` / `pnpm type-check` / `pnpm test`（domain + application パッケージ）。
- 変更は domain / application / apps/web に閉じる。apps/web はルート 1 行のみのため web テストは既存 green を確認。

## リスク / ロールバック

- リスク: 集約横断の部分失敗（設計書 D-7）。MVP1 は許容・将来 UoW で見直し。
- ロールバック: 本ユニットは既存生成 API の内部挙動変更のみ。コミット revert で従来（全量購入）へ即戻せる。
  DB スキーマ・契約変更が無いためデータ移行不要。

## 完了条件

- 全ステップ完了 + 品質ゲート PASS。
- `docs/05-roadmap.md` Sprint 5 Unit C を完了へ同期・完了条件 3 にチェック。
