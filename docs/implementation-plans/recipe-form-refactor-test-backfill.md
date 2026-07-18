# 実装計画: recipe-form-refactor-test-backfill

- 設計書: `docs/designs/recipe-form-refactor-test-backfill.md`
- 試験計画: `docs/tests/recipe-form-refactor-test-backfill.md`
- ブランチ: `claude/project-refactor-test-audit-3ea3nw`
- 実施順: Step 1（B）→ Step 2（1）→ Step 3（A）。各 Step 完了ごとにコミット

---

## Step 1: 既存ユーティリティの単体テスト（B）

| 項目     | 内容                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象     | 新規 `apps/web/src/app/recipes/_utils/build-ingredient-input.node.test.ts`、新規 `apps/web/src/app/products/_utils/product-format.node.test.ts` |
| 変更内容 | 試験計画 BI-01〜BI-08 / PF-01〜PF-07 を実装。プロダクションコードは変更しない                                                                   |
| 完了条件 | `pnpm --filter web test` の node プロジェクトで新規テスト全 PASS                                                                                |

## Step 2: レシピフォーム共通化（1）

| 項目     | 内容                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象     | 新規 `recipes/_components/recipe-form-fields.tsx`、書き換え `recipes/new/_components/recipe-form-client.tsx`、書き換え `recipes/[id]/edit/_components/recipe-edit-form-client.tsx`                                                                                                                                |
| 変更内容 | 設計 D-1〜D-6 のとおり。`recipe-form-fields.tsx` に `RecipeFormValue` / `RecipeFieldErrors` / `emptyRecipeFieldErrors()` / `createInitialRecipeFormValue()` / `toRecipeFormValue(dto)` / `buildRecipeFormBody()` / `RecipeFormFields` を実装。クライアント 2 本はヘッダー・baseServings スロット・submit のみ保持 |
| 依存     | Step 1（安全網）                                                                                                                                                                                                                                                                                                  |
| 完了条件 | `pnpm lint` / `pnpm type-check` / 既存 + Step 1 テスト全 PASS。送信 JSON の形が現行と同一（Step 3 の RFC/REF テストで固定）                                                                                                                                                                                       |

## Step 3: コンポーネントテスト補充（A）

| 項目     | 内容                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象     | 新規 test 11 本: recipes（form-fields / form-client / edit-form-client / ingredient-row / step-row / tag-filter / recipe-card / recipe-list-client / recipe-detail-client）+ products（product-form-fields / price-record-form） |
| 変更内容 | 試験計画の観点 ID を実装。既存テストの流儀（`vi.hoisted` + `vi.mock('@/lib/api-client')` / `next/navigation` / `next/link`、`cleanup`、観点 ID 付き it 名）に揃える                                                              |
| 依存     | Step 2（リファクタ後の形に対して書く）                                                                                                                                                                                           |
| 完了条件 | `pnpm test` 全 PASS                                                                                                                                                                                                              |

## 最終確認（definition-of-done）

- `pnpm lint` / `pnpm type-check` / `pnpm test` 全 PASS
- スコープ外変更なし（Hono ルート・packages 配下・既存挙動に差分なし）
- コミット: Step ごとに 1 コミット、`claude/project-refactor-test-audit-3ea3nw` へ push

## ロールバック

各 Step は独立コミットのため `git revert` で個別に戻せる。Step 2 はプロダクションコード変更を
含む唯一の Step であり、revert すれば画面は現行実装に完全復帰する（Step 3 のテストは Step 2 の
形に依存するため同時 revert が必要）。
