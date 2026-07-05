# Codex Implementation Tasks — meal-plan-core

Sprint 3 Unit A（MealPlan Core バックエンド一式）を Codex に委譲するための実装指示書。
機能単位で分割しており、**番号順に実行する**（依存順）。画面(UI)は対象外（Unit B、別途）。

## タスク一覧

| #   | ファイル                                             | 対象層              | 概要                                                                         |
| --- | ----------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| 1   | [01-domain.md](./01-domain.md)                       | Domain              | MealPlanId / PlannedRecipeId / WeekIdentifier / MealPlan 集約 + テスト       |
| 2   | [02-infrastructure.md](./02-infrastructure.md)       | Infrastructure      | DB スキーマ追記 / PGlite DDL 追記 / マイグレーション生成 / Repository実装     |
| 3   | [03-application.md](./03-application.md)             | Application         | DTO / Mapper / エラー3種 / UseCase 5本 + テスト                              |
| 4   | [04-api-contract.md](./04-api-contract.md)           | API Contract        | Vitest導入 / Zod スキーマ / 契約テスト                                       |
| 5   | [05-presentation.md](./05-presentation.md)           | Presentation (API)  | Hono ルート5本 / app.ts 統合                                                 |

UI（Unit B）はこのパックの対象外。

## 前提（既に確定済み。実装中に変更しない）

要件定義（`docs/requirements/meal-plan-core.md`）・設計書（`docs/designs/meal-plan-core.md`、
全19セクション確定済み）・実装計画（`docs/implementation-plans/meal-plan-core.md`）・
試験計画（`docs/tests/meal-plan-core.md`）・ADR-0005（`docs/decisions/ADR-0005-week-definition-saturday-start.md`）
がすべて確定済み。各指示書はこれらから転記した自己完結の内容だが、詳細な背景・トレードオフ・
全144件の試験ケース一覧を確認したい場合はこれらのドキュメントを参照してよい（読み取り専用参照）。

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID | 確定内容 |
| --- | --- |
| C-1 | `WeekIdentifier` は週開始日の `Date` ベース（外部表現 `"2026-07-04"` ISO date 文字列）。ISO 8601 週番号（年+週番号）は不採用 |
| C-2 | `planned_recipes` は独立テーブル + JOIN 復元（JSONB 集約は不採用） |
| C-3 | 同一週への `CreateMealPlanUseCase` は冪等（既存があればステータスに関わらず既存を返す。409 エラーは発生しない） |
| C-4 | 削除済み Recipe を参照する `PlannedRecipe` は `recipeId` のみ保持（カスケード削除・論理削除は行わない） |
| D-4 | `GET /api/meal-plans/current` で MealPlan なし時は **200 + `{ data: null }`**（204 ではない） |
| D-5 | `GetMealPlanHistoryUseCase` の `limit` はデフォルト4・最大12 |
| D-6 | `scaleFactor` の DB 精度は `numeric(10, 3)` |
| D-7 | `PlannedRecipeDto` に `recipeName` は含めない（`recipeId` のみ。`RecipeRepository` を追加 DI しない） |
| G-1 | マイグレーション出力先は `apps/web/src/db/migrations/`（`packages/infrastructure/src/db/migrations/` ではない） |
| G-2 | `packages/infrastructure/src/testing/create-test-db.ts` の DDL に `meal_plans`/`planned_recipes` の `CREATE TABLE` 追記が必須（未追記だと Infrastructure テストが全滅する） |
| G-3 | `packages/api-contract` に Vitest 未導入。`package.json`/`vitest.config.ts` の追加が必須 |
| R-5（対応不要） | 非土曜日の `weekIdentifier` を Zod・Domain いずれも拒否しない。**MVP1では対応しない**（顕在化しても Domain に曜日検証を追加しない） |
| R-6（対応不要） | `scaleFactor: Infinity` は `z.number().positive()` を通過し得る。**MVP1では対応しない** |
| R-7 | Domain のエラーは**単純 `Error`** を throw し、Application 層の UseCase が catch して `InvalidMealPlanStateError`/`PlannedRecipeNotFoundError` に変換する方針を採用する（Domain 層に Application 層のエラー型を知らせない） |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（Domain + Application + Infrastructure + API-Contract + Presentation の新規テスト含む）
```

- 既存テスト（Recipe/Product/Store/health 関連）に regression がないこと
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・`import type`漏れ・
  バリデーションエラーメッセージ分岐 等）をセルフチェック済みであること

## 対象外（このパックで実装しないもの）

- 画面・UI 実装（Unit B、別セッション）
- ステータス遷移・`markAsCooked`・`scheduleForDay` の **API エンドポイント公開**
  （ドメインメソッドとしては実装対象。01-domain.md 参照）
- ShoppingList との連携
- `docs/04-domain-model.md` の更新（ADR-0005 に伴うフォローアップ。実装完了後に別途対応）

## 参照ドキュメント（読み取り専用参照。実装の根拠が必要な場合のみ）

- 要件定義: `docs/requirements/meal-plan-core.md`
- 設計書: `docs/designs/meal-plan-core.md`（§19 に契約確定仕様を含む）
- 実装計画: `docs/implementation-plans/meal-plan-core.md`（G-1〜G-3・R-1〜R-8 の詳細根拠）
- 試験計画: `docs/tests/meal-plan-core.md`（全144試験ケースの完全な一覧）
- ADR: `docs/decisions/ADR-0005-week-definition-saturday-start.md`
