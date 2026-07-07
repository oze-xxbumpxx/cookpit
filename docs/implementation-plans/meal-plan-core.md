# 実装計画: meal-plan-core

- ステータス: ready
- レベル: L3
- 設計書: `docs/designs/meal-plan-core.md`（確定。2026-07-05）
- 要件定義: `docs/requirements/meal-plan-core.md`
- 関連 ADR: `docs/decisions/ADR-0005-week-definition-saturday-start.md`（土曜始まり週定義。策定済み）

---

## 概要

MealPlan（週次献立）の Domain / Application / Infrastructure / API-Contract / Presentation(API)
全層縦スライスを新規実装する。Recipe/Product/Store 縦スライスの既存パターンを踏襲する。
画面(UI)は対象外（Unit B）。ステータス遷移 API・ShoppingList 連携も対象外。

実装順序は **Domain → Infrastructure(schema→migration→repository) → Application →
API-Contract(+テスト基盤整備) → Presentation(route→app.ts) → 各層テスト → 品質ゲート**。

---

## 実装計画作成時に判明した設計書との差異・補足（要 implementer 対応）

設計書 §8-1 に記載のないが、実際のリポジトリ構成を確認した結果、以下 3 点は実装に必須。
設計判断の変更ではなく、既存の運用パターン（他 3 テーブル追加時と同一）に合わせるための
機械的な追加であるため、Orchestrator への差し戻しは不要と判断した。ただし見落としやすいため
明記する。

| #   | 差異                                     | 内容                                                                                                                                                                                                                                                                                                                                                                           | 対応                                         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| G-1 | マイグレーション出力先                   | 設計 §8-1 は `packages/infrastructure/src/db/migrations/` と記載しているが、`apps/web/drizzle.config.ts` の `out: './src/db/migrations'` により実際の出力先は **`apps/web/src/db/migrations/`**（store-master 実装時と同じ）。`packages/infrastructure` 配下に migrations フォルダは存在しない                                                                                 | 本計画の Step 3 で正しいパスに読み替える     |
| G-2 | PGlite テスト DDL                        | `packages/infrastructure/src/testing/create-test-db.ts` は migrations を使わず、`schema.ts` と手動で同期させた DDL 文字列を PGlite に直接適用している（`recipes`/`stores`/`products`/`price_records` の 4 テーブル分が既存）。`meal_plans`/`planned_recipes` の `CREATE TABLE` 文をこの DDL に追記しないと `drizzle-meal-plan.repository.test.ts` が失敗する。設計書に記載なし | 本計画の Step 4 でこのファイルへの追記を明示 |
| G-3 | `packages/api-contract` に Vitest 未導入 | `packages/api-contract/package.json` に `test` スクリプト・`vitest` devDependency・`vitest.config.ts` が存在しない（他パッケージには全て存在）。設計 §19-9 の契約テスト `meal-plan.schema.test.ts` を `pnpm test` から実行可能にするには Vitest 導入が必要                                                                                                                     | 本計画の Step 8 で対応                       |

---

## 変更対象ファイル一覧

### 既存ファイルへの追記（8 ファイル。設計 §8-2 の 5 ファイル + 上記差異 G-1〜G-3 対応の 3 ファイル）

| #   | ファイルパス                                            | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                                          | 設計参照                                                           |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| E-1 | `packages/infrastructure/src/db/schema.ts`              | `mealPlans` / `plannedRecipes` テーブル定義・型を追記                                                                                                                                                                                                                                                                                                                                                                             | §5-1                                                               |
| E-2 | `packages/infrastructure/src/testing/create-test-db.ts` | DDL 文字列に `meal_plans` / `planned_recipes` の `CREATE TABLE` を追記（G-2）                                                                                                                                                                                                                                                                                                                                                     | §5-1 のスキーマ定義をミラー                                        |
| E-3 | `packages/infrastructure/src/index.ts`                  | `export * from './repositories/drizzle-meal-plan.repository'` を追記                                                                                                                                                                                                                                                                                                                                                              | §8-2                                                               |
| E-4 | `packages/application/src/index.ts`                     | `export * from './meal-plan'` を追記                                                                                                                                                                                                                                                                                                                                                                                              | §8-2 / §6-4                                                        |
| E-5 | `packages/api-contract/src/index.ts`                    | `export * from './meal-plan.schema'` を追記                                                                                                                                                                                                                                                                                                                                                                                       | §8-2                                                               |
| E-6 | `packages/api-contract/package.json`                    | `devDependencies` に `vitest` 追加、`scripts.test` に `"vitest run"` 追加（G-3）。**実装時追記（2026-07-07 レビュー承認）**: 型往復テスト（N-25）が実 Mapper / Domain エンティティを使うため `@cookpit/application` / `@cookpit/domain` も devDependencies に追加した。devDeps 限定のため実行時の依存方向（api-contract は葉）は不変。**今後 application 側に api-contract への依存を追加するとワークスペース循環になるため禁止** | 既存 domain/application/infrastructure package.json と同一パターン |
| E-7 | `apps/web/src/server/app.ts`                            | `mealPlansRoute` のマウント、`MealPlanNotFoundError`/`PlannedRecipeNotFoundError`/`InvalidMealPlanStateError` の `onError` 追加                                                                                                                                                                                                                                                                                                   | §7-5 / §7-4                                                        |
| E-8 | `docs/04-domain-model.md`                               | `WeekIdentifier`（96-121行目付近）・`MealPlan` 集約（325行目付近）の記述を ADR-0005 / 本設計に合わせて更新（実装完了後のフォローアップ。ADR-0005 References 節にも予告済み）                                                                                                                                                                                                                                                      | ADR-0005 Consequences                                              |

### 新規作成ファイル（26 ファイル + 契約テスト用設定 1 ファイル + マイグレーション自動生成分）

#### Domain（8 ファイル）

| #   | ファイルパス                                            | 内容                                                                                                     | 設計参照                         |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| N-1 | `packages/domain/src/meal-plan/meal-plan-id.ts`         | `MealPlanId`（ProductId パターン完全踏襲）                                                               | §4-2                             |
| N-2 | `packages/domain/src/meal-plan/planned-recipe-id.ts`    | `PlannedRecipeId`（同上）                                                                                | §4-2                             |
| N-3 | `packages/domain/src/meal-plan/meal-plan.ts`            | `MealPlan` 集約、`PlannedRecipe` エンティティ、`MealPlanStatus` 型、`MealPlanProps`/`PlannedRecipeProps` | §4-3〜§4-5                       |
| N-4 | `packages/domain/src/meal-plan/meal-plan.repository.ts` | `MealPlanRepository` インターフェース                                                                    | §4-6（末尾）                     |
| N-5 | `packages/domain/src/shared/week-identifier.ts`         | `WeekIdentifier`（土曜始まり、Date ベース）                                                              | §4-6                             |
| N-6 | `packages/domain/src/meal-plan/meal-plan-id.test.ts`    | `MealPlanId` 単体テスト                                                                                  | RecipeId/ProductId test 先例踏襲 |
| N-7 | `packages/domain/src/meal-plan/meal-plan.test.ts`       | `MealPlan` 集約・`PlannedRecipe`・ステータス遷移テスト                                                   | 要件 §6                          |
| N-8 | `packages/domain/src/shared/week-identifier.test.ts`    | `WeekIdentifier` 単体テスト（週境界・年またぎ・current）                                                 | 要件 §6-3                        |

#### Application（12 ファイル）

| #    | ファイルパス                                                                  | 内容                                          | 設計参照  |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| N-9  | `packages/application/src/meal-plan/meal-plan.dto.ts`                         | `MealPlanDto`/`PlannedRecipeDto`/各 InputDto  | §6-1      |
| N-10 | `packages/application/src/meal-plan/meal-plan.mapper.ts`                      | `toMealPlanDto`/`toPlannedRecipeDto`          | §6-2      |
| N-11 | `packages/application/src/meal-plan/meal-plan-not-found.error.ts`             | `MealPlanNotFoundError`                       | §6-3      |
| N-12 | `packages/application/src/meal-plan/planned-recipe-not-found.error.ts`        | `PlannedRecipeNotFoundError`                  | §6-3      |
| N-13 | `packages/application/src/meal-plan/invalid-meal-plan-state.error.ts`         | `InvalidMealPlanStateError`                   | §6-3      |
| N-14 | `packages/application/src/meal-plan/create-meal-plan.use-case.ts`             | `CreateMealPlanUseCase`（冪等）               | §6-4      |
| N-15 | `packages/application/src/meal-plan/add-recipe-to-meal-plan.use-case.ts`      | `AddRecipeToMealPlanUseCase`                  | §6-4      |
| N-16 | `packages/application/src/meal-plan/remove-recipe-from-meal-plan.use-case.ts` | `RemoveRecipeFromMealPlanUseCase`             | §6-4      |
| N-17 | `packages/application/src/meal-plan/get-current-meal-plan.use-case.ts`        | `GetCurrentMealPlanUseCase`                   | §6-4      |
| N-18 | `packages/application/src/meal-plan/get-meal-plan-history.use-case.ts`        | `GetMealPlanHistoryUseCase`                   | §6-4      |
| N-19 | `packages/application/src/meal-plan/index.ts`                                 | バレルエクスポート                            | §6-4 末尾 |
| N-20 | `packages/application/src/meal-plan/meal-plan-use-cases.test.ts`              | 5 UseCase のモック(InMemory)Repository テスト | 要件 §6   |

#### Infrastructure（2 ファイル + マイグレーション）

| #    | ファイルパス                                                                                                            | 内容                            | 設計参照                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| N-21 | `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`                                              | `DrizzleMealPlanRepository`     | §5-2                       |
| N-22 | `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.test.ts`                                         | PGlite 統合テスト               | 要件 §6                    |
| N-23 | `apps/web/src/db/migrations/000X_xxx.sql` + `apps/web/src/db/migrations/meta/000X_snapshot.json` + `_journal.json` 更新 | `drizzle-kit generate` 自動生成 | §5-3（G-1 のパス訂正あり） |

#### API-Contract（2 ファイル + 設定ファイル群）

| #     | ファイルパス                                         | 内容                                                                | 設計参照                                                     |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| N-24  | `packages/api-contract/src/meal-plan.schema.ts`      | 5 リクエストスキーマ + レスポンススキーマ群 + `errorResponseSchema` | §19-1〜§19-7                                                 |
| N-25  | `packages/api-contract/src/meal-plan.schema.test.ts` | 契約テスト（parse 正常系/異常系、Mapper 出力の型往復）              | §19-9                                                        |
| N-25a | `packages/api-contract/vitest.config.ts`             | 他パッケージと同一の `baseConfig` 読み込み（G-3 対応）              | domain/application/infrastructure の vitest.config.ts と同一 |

#### Presentation（2 ファイル）

| #    | ファイルパス                                    | 内容                                       | 設計参照                       |
| ---- | ----------------------------------------------- | ------------------------------------------ | ------------------------------ |
| N-26 | `apps/web/src/server/routes/meal-plans.ts`      | `mealPlansRoute`（Hono、5 エンドポイント） | §7-3                           |
| N-27 | `apps/web/src/server/routes/meal-plans.test.ts` | Hono テストクライアントによる Route テスト | 要件 §6、products.test.ts 先例 |

合計: 新規ファイル 27（うちテスト 7、設定 2）、既存ファイル追記 8。

---

## 実装手順（依存順）

### Step 1: Domain 層 — ID 値オブジェクト

**対象ファイル**: N-1 `meal-plan-id.ts`、N-2 `planned-recipe-id.ts`

**変更内容**: `packages/domain/src/product/product-id.ts` を一字一句パターン踏襲。クラス名・
プロパティ名のみ置換（`ProductId`→`MealPlanId`、`productIdValue`→`mealPlanIdValue` 等）。
`randomUUID`（`node:crypto`）を使用。

**完了条件**:

- `MealPlanId`/`PlannedRecipeId` それぞれに `private constructor`・`static generate()`・
  `static fromString()`・`equals()`・`get value()` が実装されている
- 他ファイルへの依存がない（`node:crypto` のみ）

---

### Step 2: Domain 層 — WeekIdentifier

**対象ファイル**: N-5 `packages/domain/src/shared/week-identifier.ts`

**変更内容**: 設計 §4-6 の仕様通りに実装する。

- `private constructor(weekStartDate: Date)`
- `static fromDate(date: Date): WeekIdentifier` — `daysFromSaturday = (date.getDay() + 1) % 7` で
  直前の土曜まで巻き戻し、時刻を `00:00:00.000` にリセットした **新しい Date** を生成する
  （引数の `date` を破壊的に変更しない。`setHours`/`setDate` は必ずコピーに対して行う）
- `static current(): WeekIdentifier` — `WeekIdentifier.fromDate(new Date())`
- `static fromString(value: string): WeekIdentifier` — `new Date(value + 'T00:00:00')`
- `startDate(): Date` — 内部 `weekStartDate` の防御的コピーを返す（`Product.createdAt` getter と同パターン: `new Date(this.weekStartDate)`）
- `endDate(): Date` — `startDate()` に 6 日加算し `23:59:59.999` を設定した新しい Date
- `next(): WeekIdentifier` — `startDate()` + 7日を渡して `new WeekIdentifier(...)`（`private constructor` のため内部的に生成。あるいは `fromDate` を経由してもよいが 7日後は必ず土曜なので直接 `new` でも安全）
- `previous(): WeekIdentifier` — `startDate()` - 7日
- `equals(other: WeekIdentifier): boolean` — `startDate().getTime() === other.startDate().getTime()`
- `toString(): string` — `startDate()` を `"YYYY-MM-DD"` にフォーマット（**`toISOString().slice(0,10)` は使わない**。ローカルタイムの日付とUTC日付がズレる可能性があるため、`getFullYear()`/`getMonth()`/`getDate()` から手動で `YYYY-MM-DD` を組み立てる。JST 環境が前提だが `toISOString()` は UTC 変換するため日付がズレるリスクがある）

**注意点（実装時判断ポイント）**:

- `toString()` の実装で `toISOString().slice(0,10)` を使うと、JST 深夜0時付近で UTC 変換により
  日付がずれるバグを生みやすい（既知の JS 落とし穴）。必ず local getter（`getFullYear`/`getMonth`/`getDate`）
  から手動でゼロパディングして組み立てること。他の Date→ISO文字列変換（`createdAt.toISOString()`等、
  DTO の datetime 用途）とは別の関心事なので混同しない。

**完了条件**:

- `fromDate` が土曜(`getDay()===6`)を渡すと当日 `00:00:00.000` を返す（境界条件 B-01/B-03）
- `fromDate` が金曜(`getDay()===5`)を渡すと直前の土曜を返す（B-02）
- 年またぎ週（2026-12-26〜2027-01-01）で `weekStartDate` が正しく `2026-12-26` になる（B-11）
- `toString()` が `"2026-07-04"` 形式の文字列を返す
- `fromString("2026-07-04").toString() === "2026-07-04"` のラウンドトリップが成立する

---

### Step 3: Domain 層 — MealPlan 集約 / Repository インターフェース

**対象ファイル**: N-3 `meal-plan.ts`、N-4 `meal-plan.repository.ts`

**依存**: Step 1（`MealPlanId`/`PlannedRecipeId`）、Step 2（`WeekIdentifier`）、
既存 `packages/domain/src/recipe/recipe-id.ts`（`RecipeId` を `import type { RecipeId } from '../recipe/recipe-id'` で同パッケージ内相対インポート）

**変更内容**: 設計 §4-3〜§4-5 の通り実装する。

- `PlannedRecipe`: `private constructor`、`static create(recipeId, scaleFactor)`
  （`scaleFactor <= 0` で `throw new Error('scaleFactor must be positive')`）、
  `static reconstruct(props)`、`scheduleFor(date)`、`markAsCooked(at)`、getter 一式
- `MealPlan`: `private constructor`、`static create(weekOf)`、`static reconstruct(props)`、
  `addRecipe`、`removeRecipe`、`transitionTo`、`scheduleForDay`、`markAsCooked`、
  `private canTransitionTo`、getter 一式（`plannedRecipes` getter は防御的コピー `[...this.plannedRecipes]`）
- 遷移テーブルは `Record<MealPlanStatus, MealPlanStatus[]>` で定義（設計 §4-3 の表を機械的に転記）:
  ```
  draft: ['shopping']
  shopping: ['draft', 'cooking']
  cooking: ['consuming']
  consuming: ['completed']
  completed: []
  ```
- `MealPlanRepository` インターフェース: `findById`/`findByWeek`/`findRecent`/`save`（設計 §4-6 末尾のコードをそのまま転記）

**実装時判断ポイント（設計 §6-3 が implementer 判断に委譲した事項）**:
Domain の `addRecipe`/`removeRecipe`/`transitionTo` が投げるエラーを、独自の軽量エラー型
（例 `MealPlanDomainError` 系）にするか、単純な `Error` にするかは実装時に選んでよい。
既存 Recipe/Product パターン（`Product.update()` は単純 `Error` を投げ、Application 層は
`instanceof` チェックしない）に倣うなら単純 `Error` で統一するのが最小実装。
その場合、Application 層（Step 6）の UseCase が catch して `InvalidMealPlanStateError`/
`PlannedRecipeNotFoundError` に変換する責務を持つ（設計 §6-4 のシーケンス通り）。
**この計画では「単純 Error + UseCase 側で変換」を推奨実装として採用する**
（既存パターンとの一貫性を優先。Domain 層に Application 層のエラー型を知らせない）。

**完了条件**:

- `addRecipe`/`removeRecipe` は `status` が `draft`/`shopping` 以外で例外を投げる
- `transitionTo` は遷移表に従い、不可能な遷移で例外を投げる。`completed` 遷移時のみ `completedAt = new Date()` を設定する
- `plannedRecipes` getter が防御的コピーを返す（呼び出し元で `push` しても内部状態が変わらない）
- `MealPlanRepository` インターフェースが 4 メソッドを定義している（`delete` は定義しない）
- `pnpm --filter @cookpit/domain type-check` がエラーなし

---

### Step 4: Infrastructure — スキーマ追記・PGlite DDL 同期（G-1/G-2 対応含む）

**対象ファイル**: E-1 `packages/infrastructure/src/db/schema.ts`、E-2 `packages/infrastructure/src/testing/create-test-db.ts`

**E-1 変更内容**: 設計 §5-1 のコードをそのまま追記する。

- import 文に `date` を追加（既存 `index, integer, jsonb, numeric, pgTable, text, timestamp` に追加）
- `mealPlans`（`week_start_date` は `unique()` 付き）、`plannedRecipes`（`meal_plan_id` インデックス付き）を末尾に追記
- `MealPlanRow`/`NewMealPlanRow`/`PlannedRecipeRow`/`NewPlannedRecipeRow` 型をエクスポート

**E-2 変更内容（G-2 対応。設計に記載なし・実装必須）**: `DDL` 定数の末尾（`price_records_product_id_idx`
のインデックス作成文の後）に以下を追記する。

```sql
CREATE TABLE IF NOT EXISTS meal_plans (
  id text PRIMARY KEY,
  week_start_date date NOT NULL UNIQUE,
  status text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS planned_recipes (
  id text PRIMARY KEY,
  meal_plan_id text NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id text NOT NULL,
  scale_factor numeric(10, 3) NOT NULL,
  scheduled_date date,
  cooked_at timestamp,
  notes text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planned_recipes_meal_plan_id_idx ON planned_recipes (meal_plan_id);
```

**注意点**: `schema.ts` の Drizzle 定義と DDL 文字列は独立管理（既存コメント「migrations フォルダが
存在しないため schema.ts を正典として直接適用する」の通り、テスト用 DB では migrations を使わない）。
カラム名・型・制約を両者で完全一致させること（特に `numeric(10, 3)` の precision/scale）。

**完了条件**:

- `schema.ts` に `mealPlans`/`plannedRecipes` テーブル定義が追記され、既存 4 テーブル定義が変わっていない
- `create-test-db.ts` の DDL に 2 テーブル分の `CREATE TABLE IF NOT EXISTS` が追記され、既存 DDL が変わっていない
- `pnpm --filter @cookpit/infrastructure type-check` がエラーなし

---

### Step 5: Infrastructure — マイグレーション生成（G-1: パス訂正）

**実行コマンド**:

```bash
pnpm --filter @cookpit/web db:generate
```

（プロジェクト直下に `db:generate` は無いため、`apps/web` を `--filter` で指定する。store-master 実装時と同一手順）

**生成先**: `apps/web/src/db/migrations/`（設計 §8-1 記載の `packages/infrastructure/src/db/migrations/`
ではなく、実際の `drizzle.config.ts` の `out` 設定に従うこの場所が正。G-1 参照）

**完了条件**:

- `apps/web/src/db/migrations/` に新しい `.sql` ファイルが生成され、`CREATE TABLE "meal_plans"`
  と `CREATE TABLE "planned_recipes"` が含まれる
- `meta/_journal.json` に新しいエントリが追記される（既存 `0000`〜`0004` のエントリは変更しない）
- 既存 4 テーブル（`recipes`/`stores`/`products`/`price_records`）への `ALTER` 文が含まれていない
- `week_start_date` に `UNIQUE` 制約が SQL に含まれる
- `planned_recipes_meal_plan_id_idx` インデックス作成文が含まれる
- 生成ファイルはそのままコミット対象とする（手動編集しない）

---

### Step 6: Infrastructure — DrizzleMealPlanRepository 実装

**対象ファイル**: N-21 `drizzle-meal-plan.repository.ts`、E-3 `packages/infrastructure/src/index.ts`

**依存**: Step 3（Domain）、Step 4（schema.ts の型）

**変更内容**: 設計 §5-2 のメソッド設計・マッピング表をそのまま実装する。
`DrizzleProductRepository`（`packages/infrastructure/src/repositories/drizzle-product.repository.ts`）の
`toProducts()` グルーピングロジック・`save()` の upsert+`notInArray`削除パターンを完全に踏襲する。

- `findById`/`findByWeek`: `meal_plans` と `planned_recipes` を `leftJoin` し、グルーピングして
  `MealPlan.reconstruct()` に変換する private helper（`toMealPlans(rows)`/`toEntity(...)` 相当）を実装
- `findRecent(limit)`: `ORDER BY meal_plans.week_start_date DESC` で全件 JOIN 取得 →
  グルーピング → `slice(0, limit)`（設計 §5-2 の通り「グルーピング後に limit 件」。
  DB の `.limit(limit)` を JOIN 済みクエリに直接付けると行数が本来の MealPlan 件数と一致しない点に注意。
  MVP1 規模では 2 クエリ方式は不要。全件取得してからアプリ側でグルーピング・スライスする）
- `save(mealPlan)`: `meal_plans` を `onConflictDoUpdate`（対象: `id`。`set` に `week_start_date` は
  含めない — 週は不変フィールドのため upsert 対象外。`status`/`completed_at` のみ更新） →
  現在の `plannedRecipes` の ID リストを取得 → `notInArray` で不要行を DELETE
  （`currentIds.length === 0` の場合は `meal_plan_id` 一致行を全 DELETE。`DrizzleProductRepository.save()`
  の分岐と同一） → 各 `plannedRecipe` を `onConflictDoUpdate` で upsert
- ドメイン→DB・DB→ドメインのマッピングは設計 §5-2 の 2 つの表をそのまま実装する
  （`scaleFactor: Number(row.scaleFactor)`、`scheduledDate: row.scheduledDate ? new Date(row.scheduledDate + 'T00:00:00') : null` 等）
- `WeekIdentifier.fromString(row.weekStartDate)` で `weekOf` を復元する

**E-3 変更内容**: `packages/infrastructure/src/index.ts` 末尾に
`export * from './repositories/drizzle-meal-plan.repository';` を追記する。

**完了条件**:

- `MealPlanRepository` の 4 メソッド全てが実装されている
- `findRecent` が JOIN 後グルーピング→`slice(0, limit)` の順で実装されている（DB LIMIT に依存しない）
- `save()` が `week_start_date` を upsert の `set` に含めていない（週は不変）
- `numeric` カラムの読み出しに全て `Number()` 変換が入っている
- `DrizzleMealPlanRepository` が `packages/infrastructure/src/index.ts` からエクスポートされている
- `pnpm --filter @cookpit/infrastructure type-check` がエラーなし

---

### Step 7: Application 層実装（ファイル作成順: dto → mapper → error 3本 → use-case 5本 → index）

**対象ファイル**: N-9〜N-19、E-4

**依存**: Step 3（Domain の `MealPlan`/`MealPlanRepository`/`WeekIdentifier`）

#### Step 7-1: DTO（N-9）

設計 §6-1 のコードをそのまま転記する。`MealPlanStatus` 型も再エクスポート
（Domain の `MealPlanStatus` と同じユニオン文字列だが Application 層専用の型として定義。
`import type { MealPlanStatus } from ...` ではなく独自定義する設計方針 — 設計書コード通り
Application 層で type を再宣言する）。

#### Step 7-2: Mapper（N-10）

設計 §6-2 の通り実装する。

- `toMealPlanDto(mealPlan)`: `weekIdentifier: mealPlan.weekOf.toString()`、
  `plannedRecipes: mealPlan.plannedRecipes.map(toPlannedRecipeDto)`、
  `createdAt: mealPlan.createdAt.toISOString()`、`completedAt: mealPlan.completedAt?.toISOString() ?? null`
- `toPlannedRecipeDto(plannedRecipe)`: `scheduledDate: plannedRecipe.scheduledDate ? plannedRecipe.scheduledDate.toISOString().slice(0, 10) : null`、
  `cookedAt: plannedRecipe.cookedAt?.toISOString() ?? null`

**注意（Step 2 との整合）**: ここでの `scheduledDate` の ISO 文字列化は DTO 出力専用の変換であり、
`WeekIdentifier.toString()`（Step 2、ローカル日付ベース）とは別の関心事。`PlannedRecipe.scheduledDate`
はドメイン上「日付のみ」を表すため `toISOString().slice(0,10)` で妥当（設計のコードそのまま踏襲。
JST/UTC ズレのリスクは `WeekIdentifier` ほど重要ではないが、実運用でズレが疑われた場合は
`week-identifier.ts` と同様のローカル日付組み立てに変更する余地があることをコメントで残してもよい）。

#### Step 7-3: エラークラス 3 本（N-11, N-12, N-13）

`ProductNotFoundError`/`StoreNotFoundError` パターンを完全踏襲。
`InvalidMealPlanStateError` のみ引数が異なる（`current: MealPlanStatus, operation: string`）。

```typescript
export class InvalidMealPlanStateError extends Error {
  constructor(current: MealPlanStatus, operation: string) {
    super(`Cannot ${operation} a MealPlan with status '${current}'`);
    this.name = 'InvalidMealPlanStateError';
  }
}
```

#### Step 7-4〜7-8: UseCase 5 本（N-14〜N-18）

設計 §6-4 のシーケンスをそのまま実装する。Step 3 の「実装時判断ポイント」で Domain が単純 `Error`
を投げる方針を採用した場合、各 UseCase は以下の変換責務を持つ:

- `AddRecipeToMealPlanUseCase`/`RemoveRecipeFromMealPlanUseCase`: `mealPlan.addRecipe(...)`/
  `removeRecipe(...)` の呼び出しを try-catch し、エラーメッセージ内容から
  `InvalidMealPlanStateError`（status ガード違反）か `PlannedRecipeNotFoundError`
  （`removeRecipe` で対象が見つからない場合）かを判別して re-throw する。
  **メッセージ文字列マッチによる判別は壊れやすいため、Step 3 で Domain 側に判別可能な
  最小限の情報（例: エラー名 `'InvalidMealPlanStateError'`/`'PlannedRecipeNotFoundError'` を
  Domain 内で定義するか、`instanceof` 可能な専用クラスにする）を用意するほうが安全。
  実装時にどちらの方式でも良いが、テストで両エラーが正しく判別されることを検証すること**
- `CreateMealPlanUseCase`: `findByWeek` で既存確認 → あれば`toMealPlanDto(existing)`を返す（冪等）。
  なければ `MealPlan.create` → `save` → `toMealPlanDto`
- `GetCurrentMealPlanUseCase.execute(asOf？: Date)`: `WeekIdentifier.fromDate(asOf ?? new Date())` →
  `findByWeek` → DTO または `null`
- `GetMealPlanHistoryUseCase.execute(input)`: `limit = input.limit ?? 4` → `findRecent(limit)` → DTO配列

#### Step 7-9: index.ts（N-19）

設計 §6-4 末尾のバレルエクスポートをそのまま転記。

#### Step 7-10: application/src/index.ts 追記（E-4）

```typescript
// application package
export * from './recipe';
export * from './store';
export * from './product';
export * from './meal-plan';
```

**完了条件（Step 7 全体）**:

- 5 UseCase 全てが `MealPlanRepository` のみをコンストラクタで受け取る（`RecipeRepository` は注入しない。D-7）
- `CreateMealPlanUseCase` が同一週で 2 回呼ばれても `save` が 1 回しか発生しない（冪等）
- `InvalidMealPlanStateError`/`PlannedRecipeNotFoundError`/`MealPlanNotFoundError` が要件 §6-2 の
  E-01〜E-09 の通り適切に投げ分けられる
- `pnpm --filter @cookpit/application type-check` がエラーなし

---

### Step 8: API-Contract 層実装（G-3: Vitest 導入含む）

**対象ファイル**: N-24, N-25, N-25a, E-5, E-6

#### Step 8-1: Vitest 導入（G-3。設計に記載なし・実装必須）

**対象ファイル**: E-6 `packages/api-contract/package.json`

`devDependencies` に `"vitest": "^3.2.0"` を追加し、`scripts` に `"test": "vitest run"` を追加する
（`packages/domain/package.json` と同一バージョン・同一スクリプト文字列）。

**対象ファイル**: N-25a `packages/api-contract/vitest.config.ts`（新規）

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';

export default baseConfig;
```

（`packages/domain/vitest.config.ts` と一字一句同一）

#### Step 8-2: meal-plan.schema.ts（N-24）

設計 §19-1〜§19-7 のコードをそのまま転記する。

- `createMealPlanSchema`（`weekIdentifier: z.iso.date()`）
- `addRecipeToMealPlanSchema`（`recipeId: z.uuid()`, `scaleFactor: z.number().positive()`）
- `mealPlanIdParamSchema`（`id: z.uuid()`）
- `plannedRecipeIdParamSchema`（`id: z.uuid()`, `plannedRecipeId: z.uuid()`）
- `getMealPlanHistoryQuerySchema`（`limit: z.coerce.number().int().min(1).max(12).default(4)`）
- `mealPlanStatusSchema`/`plannedRecipeResponseSchema`/`mealPlanResponseSchema`/
  `getCurrentMealPlanResponseSchema`/`mealPlanHistoryResponseSchema`/`errorResponseSchema`
- 各 `z.infer` 型エクスポート

**注意**: `import z from 'zod'`（デフォルトインポート。`store.schema.ts`/`product.schema.ts` と同一形式）で統一する。

#### Step 8-3: meal-plan.schema.test.ts（N-25）

設計 §19-9 の観点対応表に従い実装する（試験計画の確定自体は test-designer が別途
`docs/tests/meal-plan-core.md` に整備するため、ここでは §19-9 の表に列挙された観点を
最低限カバーする実装を行う）。

- 正常な `weekIdentifier`（例 `"2026-07-04"`）が `createMealPlanSchema.parse()` を通過する
- 不正フォーマット・不正暦日（`"2026/07/04"`、`"2026-13-01"`、`"2026-02-30"`）が reject される
- `recipeId`/`id`/`plannedRecipeId` の UUID 不正が reject される
- `scaleFactor` の境界（`0` reject、負数 reject、`0.001` accept、`3` accept）
- `limit` の coerce・default・境界（`limit=1` accept、`limit=12` accept、`limit=13` reject、
  `limit=0` reject、`limit=""` reject、`limit="abc"` reject、`limit=2.5` reject、未指定時 `4`）
- `mealPlanResponseSchema`/`plannedRecipeResponseSchema` が Mapper（Step 7-2）の出力形と
  一致する（`parse()` が通る）ことを型往復テストで検証
- nullable フィールド（`scheduledDate`/`cookedAt`/`completedAt`/`getCurrentMealPlanResponseSchema.data`）が `null` を許容する

#### Step 8-4: api-contract/src/index.ts 追記（E-5）

```typescript
// api-contract package
export * from './recipe.schema';
export * from './product.schema';
export * from './store.schema';
export * from './meal-plan.schema';
```

**完了条件**:

- `pnpm --filter @cookpit/api-contract test` が実行可能になり green
- `pnpm --filter @cookpit/api-contract type-check` がエラーなし
- 既存 `product.schema.ts`/`store.schema.ts`/`recipe.schema.ts` に変更がない

---

### Step 9: Presentation 層実装

**対象ファイル**: N-26 `meal-plans.ts`、E-7 `app.ts`

**依存**: Step 7（UseCase）、Step 6（Repository）、Step 8（Zod スキーマ）

#### Step 9-1: mealPlansRoute（N-26）

設計 §7-3 のコードをそのまま実装する。`products.ts`/`stores.ts` と同一の手動 DI ファクトリ
パターン（`function mealPlanRepository(): DrizzleMealPlanRepository { return new DrizzleMealPlanRepository(getDb()); }`）を使う。

- `POST /` → `createMealPlanSchema` 検証 → `CreateMealPlanUseCase` → 201
- `GET /current` → `GetCurrentMealPlanUseCase` → `c.json({ data: dto })`（200。D-4）
- `GET /history` → `getMealPlanHistoryQuerySchema` 検証（query） → `GetMealPlanHistoryUseCase` → 200
- `POST /:id/recipes` → `mealPlanIdParamSchema`(param) + `addRecipeToMealPlanSchema`(json) 検証 →
  `AddRecipeToMealPlanUseCase` → 201
- `DELETE /:id/recipes/:plannedRecipeId` → `plannedRecipeIdParamSchema`(param) 検証 →
  `RemoveRecipeFromMealPlanUseCase` → `c.body(null, 204)`

#### Step 9-2: app.ts 追記（E-7）

設計 §7-4/§7-5 の通り、import 追加・`.route('/meal-plans', mealPlansRoute)` 追加・
`onError` に 3 分岐追加する。既存の `RecipeNotFoundError`/`ProductNotFoundError`/
`StoreNotFoundError` 分岐・`console.error` フォールバックを変更しない。

**完了条件**:

- 5 エンドポイント全てが設計 §7-1 の表通りの HTTP メソッド・パス・ステータスで動作する
- `GET /api/meal-plans/current` は MealPlan なしでも 200 + `{ data: null }` を返す（D-4。204 にしない）
- `app.ts` の既存 3 エラー分岐（Recipe/Product/Store）が変更されていない
- `pnpm --filter @cookpit/web type-check` がエラーなし

---

### Step 10: テスト実装（各層 co-located。Step 1〜9 と並行して随時作成可）

設計・要件書の対応関係を以下に整理する（詳細な試験観点網羅は test-designer が
`docs/tests/meal-plan-core.md` に整備する。本計画は「どのファイルで何をカバーするか」の対応づけに留める）。

| テストファイル                                                                  | 対象                        | カバーする主な観点（要件 §6 対応）                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/meal-plan/meal-plan-id.test.ts`                            | `MealPlanId`                | ID1〜ID4 相当（generate/fromString/equals）                                                                                                                                                                               |
| `packages/domain/src/meal-plan/meal-plan.test.ts`                               | `MealPlan`/`PlannedRecipe`  | N-13〜N-15（遷移表全経路）、E-10〜E-12（不可遷移）、6-4 ステータス遷移全経路表、B-07/B-08（scaleFactor境界）、B-09/B-10（removeRecipe/重複addRecipe）、`completedAt` 設定確認、`plannedRecipes` getter の防御的コピー確認 |
| `packages/domain/src/shared/week-identifier.test.ts`                            | `WeekIdentifier`            | B-01〜B-05（週境界）、B-11（年またぎ）、`current()`、`toString()`/`fromString()` ラウンドトリップ                                                                                                                         |
| `packages/application/src/meal-plan/meal-plan-use-cases.test.ts`                | 5 UseCase                   | N-01〜N-12（正常系）、E-01〜E-09（異常系）。InMemoryMealPlanRepository を実装（`product-use-cases.test.ts` の `InMemoryProductRepository` パターン踏襲）                                                                  |
| `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.test.ts` | `DrizzleMealPlanRepository` | save/findById/findByWeek/findRecent の JOIN 復元・upsert・`notInArray` 削除、`numeric(10,3)`の`Number()`往復、`date`型の`'T00:00:00'`往復、`findRecent`のlimit件数保証（JOIN行膨張への対策確認）                          |
| `packages/api-contract/src/meal-plan.schema.test.ts`                            | Zod スキーマ                | 設計 §19-9 観点表（E-13, E-14, B-06, D-5, scaleFactor境界 等）                                                                                                                                                            |
| `apps/web/src/server/routes/meal-plans.test.ts`                                 | `mealPlansRoute`            | 各エンドポイントの成功/400/404/422、`GET /current`の200+`{data:null}`。`products.test.ts`パターン（`vi.mock('@/db/client')`、`vi.mock('@cookpit/application')`）踏襲                                                      |

**`meal-plans.test.ts` 実装時の注意**: `products.test.ts` は UseCase をモック化して Route の
入出力配線のみを検証するパターン。MealPlan でも同様に `vi.mock('@cookpit/application', ...)` で
5 UseCase をモック化し、`execute` の呼び出し引数・戻り値・ステータスコードのみを検証する
（Repository・DB 接続は行わない）。

**完了条件**:

- 上記 7 ファイル全てが作成され、要件書 §6 の N/E/B 番号に対応するテストケースが存在する
- 既存テスト（Recipe/Product/Store 関連）が壊れていない

---

### Step 11: 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
```

**完了条件**:

- 3 コマンド全てがエラーなしで完走する
- 新規追加した 7 テストファイルが全て green
- 既存テスト（Recipe/Product/Store/health）に regression がない

---

## 実装順序サマリ

```
Step 1  Domain: meal-plan-id.ts, planned-recipe-id.ts（新規）
Step 2  Domain: shared/week-identifier.ts（新規）
Step 3  Domain: meal-plan.ts, meal-plan.repository.ts（新規）
Step 4  Infra: schema.ts 追記（E-1）+ create-test-db.ts DDL追記（E-2, G-2）
Step 5  Infra: pnpm --filter @cookpit/web db:generate（マイグレーション自動生成, G-1）
Step 6  Infra: drizzle-meal-plan.repository.ts（新規）+ infrastructure/index.ts 追記（E-3）
Step 7  Application: dto → mapper → error×3 → use-case×5 → index →
        application/index.ts 追記（E-4）
Step 8  API-Contract: package.json/vitest.config.ts 追加（E-6, N-25a, G-3）→
        meal-plan.schema.ts（N-24）→ meal-plan.schema.test.ts（N-25）→
        api-contract/index.ts 追記（E-5）
Step 9  Presentation: meal-plans.ts（N-26）→ app.ts 追記（E-7）
Step 10 各層テスト実装（Step 1〜9 の各ファイル作成直後に co-located で追加してよい）
Step 11 品質ゲート（lint / type-check / test）
```

---

## 依存関係グラフ

```
Step 1（Domain ID VO）
  └─→ Step 2（Domain WeekIdentifier）※ Step 1 と独立、並行可
        └─→ Step 3（Domain MealPlan集約・Repository IF）※ Step 1・2 完了必須
              └─→ Step 4（Infra schema.ts + create-test-db.ts DDL）※ Step 3 のRow型設計と整合させる
                    └─→ Step 5（マイグレーション生成）※ schema.ts 変更直後
                          └─→ Step 6（Infra Repository実装）※ Step 3のDomain型・Step 4のRow型に依存
                                └─→ Step 7（Application: UseCase群）※ Step 3のDomain・Step 6のRepositoryに依存
                                      ├─→ Step 8（API-Contract: 独立に進行可。Step 7のDTOと構造整合させる必要あり）
                                      └─→ Step 9（Presentation）※ Step 7のUseCase・Step 8のZodスキーマ両方に依存
                                            └─→ Step 10（テスト実装）
                                                  └─→ Step 11（品質ゲート）
```

- Step 2 は Step 1 と並行実装可能（相互依存なし）。
- Step 8（API-Contract）は Step 7 と並行して着手できるが、レスポンススキーマ（§19-6）は
  Step 7-2 の Mapper 出力構造と一致させる必要があるため、最終的な型往復テスト（N-25）は
  Step 7 完了後に実施する。
- Step 10 の各テストファイルは対応する実装ステップの直後に co-located で作成してもよい
  （例: `meal-plan.test.ts` は Step 3 の直後）。本計画では便宜上まとめて Step 10 に記載している。

---

## リスク

| #               | リスク                                                                                                                                        | 影響                                                                                                                         | 対策                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1             | `findRecent` で LEFT JOIN 後に DB の `.limit(limit)` を直接付けてしまう                                                                       | JOIN で行が膨らむため、実際の MealPlan 件数が `limit` より少なくなる不具合（設計 §5-2）                                      | Step 6 で「全件 JOIN 取得 → アプリ側グルーピング → `slice(0, limit)`」の順で実装する。テスト（Step 10）で「1 MealPlan に複数 PlannedRecipe がある状態で `limit=1`」のケースを追加して検証する                                           |
| R-2             | `numeric(10,3)` カラム（`scale_factor`）が Drizzle では文字列で返る                                                                           | `Number()` 変換漏れで DTO の `scaleFactor` が文字列型のまま返り、Zod/型検証で失敗する                                        | Step 6 のマッピングで必ず `Number(row.scaleFactor)` を通す。`drizzle-product.repository.ts` の `priceAmount`/`unitPriceAmount`/`packageSizeValue` と同一パターンを踏襲する                                                              |
| R-3             | `date` 型カラム（`week_start_date`/`scheduled_date`）の往復でタイムゾーンずれ                                                                 | JST 前提だが `new Date(value)`（`'T00:00:00'` 補完なし）で復元すると UTC 深夜として解釈されローカル日付が前日にずれる        | 設計 §4-6/§5-2 の通り必ず `value + 'T00:00:00'` を付与してから `new Date()` する。Step 2 の `WeekIdentifier.fromString` と Step 6 の `scheduledDate` 復元の両方で徹底する                                                               |
| R-4             | `WeekIdentifier.toString()` を `toISOString().slice(0,10)` で実装してしまう                                                                   | JST 環境でも `Date` オブジェクトの内部表現は UTC のため、日付境界付近でずれるリスク（既知の JS 落とし穴）                    | Step 2 の完了条件に明記した通り `getFullYear`/`getMonth`/`getDate` から手動で組み立てる。テストで `new Date('2026-07-04T00:00:00')` を渡した際に `"2026-07-04"` が返ることを明示的に検証する                                            |
| R-5（対応済み） | 非土曜日の `weekIdentifier`（例 `"2026-07-05"` 日曜）を `POST /api/meal-plans` に渡しても Zod（`z.iso.date()`）は曜日検証をしないため通過する | 実際の週開始日と異なる `weekStartDate` を持つ MealPlan が作成され、`findByWeek`（土曜基準）で取りこぼす破綻パスがあった      | **対応済み（2026-07-05、レビュー N-A / ユーザー承認）**。`WeekIdentifier.fromString` が入力を直前の土曜へスナップ（曜日検証で弾くのではなく正規化）するよう変更。非土曜入力でも `weekStartDate = 土曜` が保証される。設計 §4-6 更新済み |
| R-6（解消済み） | `scaleFactor` に `Infinity` を渡すと `z.number().positive()` が accept してしまう懸念（設計 §19-11）                                          | —                                                                                                                            | **2026-07-07 レビューの実測で否定**。Zod v4（`zod@4.4.3`）の `z.number()` はデフォルトで `Infinity` / `NaN` を reject するため懸念自体が発生しない。設計 §19-11 も同日訂正済み。対応不要                                                |
| R-7             | Domain のエラー方針（単純 `Error` vs 独自ドメインエラー型）を Step 3 と Step 7 で implementer が食い違った実装をする                          | UseCase 側のエラー判別ロジックが期待通り動作せず、404/422 の出し分けにバグが出る                                             | 本計画 Step 3・Step 7 で「単純 Error + UseCase 側で変換」を推奨方式として明記した。実装時にこの方針から逸脱する場合は Step 3・Step 7 の記述を両方見直すこと（片方だけ変えない）                                                         |
| R-8             | G-1〜G-3（マイグレーションパス、PGlite DDL、api-contract の Vitest 未導入）を見落として実装する                                               | マイグレーションが誤った場所に生成される／Infrastructure テストが DB エラーで失敗する／契約テストが `pnpm test` に含まれない | 本計画冒頭の「設計書との差異・補足」表と Step 4/5/8 の該当箇所で明示。実装着手前に必ず一読する                                                                                                                                          |

---

## ロールバック方法

設計 §18「移行とリリース」の通り、新規テーブル追加のみで既存テーブルへの変更はない。

1. **Domain（Step 1〜3）**: `packages/domain/src/meal-plan/` ディレクトリと
   `packages/domain/src/shared/week-identifier.ts`（+テスト）を削除する。他ファイルへの
   影響はない（Recipe の `RecipeId` を参照するのみで、Recipe 側は変更していない）。
2. **Infrastructure（Step 4〜6）**:
   - `schema.ts` から `mealPlans`/`plannedRecipes` 定義を削除する
   - `create-test-db.ts` の DDL から該当 `CREATE TABLE`/`CREATE INDEX` を削除する
   - 生成されたマイグレーションファイル（`apps/web/src/db/migrations/000X_xxx.sql` と対応する
     `meta/000X_snapshot.json`）を削除し、`meta/_journal.json` から該当エントリを削除する
   - 本番 DB に適用済みの場合は `DROP TABLE planned_recipes; DROP TABLE meal_plans;`
     （`planned_recipes` が `meal_plans` を参照しているため FK 制約上この順序で DROP する。
     `CASCADE` を使わず子テーブルから先に消す）
   - `drizzle-meal-plan.repository.ts`（+テスト）を削除し、`infrastructure/src/index.ts` の
     export 行を削除する
3. **Application（Step 7）**: `packages/application/src/meal-plan/` ディレクトリを削除し、
   `application/src/index.ts` の `export * from './meal-plan'` を削除する
4. **API-Contract（Step 8）**: `meal-plan.schema.ts`（+テスト）を削除し、
   `api-contract/src/index.ts` の追記行を削除する。G-3 で追加した `vitest.config.ts`/
   `package.json` の変更は他パッケージにも有用な汎用変更のため必ずしも戻す必要はないが、
   完全ロールバックする場合は削除・復元する
5. **Presentation（Step 9）**: `routes/meal-plans.ts`（+テスト）を削除し、`app.ts` の
   3 箇所の変更（import・`.route()`・`onError` 3分岐）を元に戻す

各層は疎結合（Domain 変更なしで Infrastructure だけロールバック可能、等）だが、
Infrastructure と Application はテーブル・型の整合が必要なため、原則 Step 順の逆順で戻す。

---

## ドキュメント更新箇所

- **`docs/04-domain-model.md`**（E-8。必須）: `WeekIdentifier`（96-121行目付近、
  「ISO 8601 週番号で算出」という現行コメント）と `MealPlan` 集約（325行目以降の遷移テーブル・
  `MealPlanStatus` 定義）を、本実装（設計 §4 / ADR-0005）に合わせて更新する。
  ADR-0005 の Consequences 節で「同ドキュメントの該当箇所を更新する必要がある」と明記済みの
  フォローアップ。実装完了後、reviewer 工程または別途ドキュメント整備タスクで対応する。
- **`docs/designs/meal-plan-core.md`**: ステータスを「確定」→「実装済み」に更新する（実装完了後）。
- **`docs/05-roadmap.md`**: Sprint 3（217行目〜）の「MealPlan ドメインモデル実装」
  「Drizzle スキーマ + Repository」タスクを完了マークに更新する（実装完了後、運用方針があれば）。
- **`docs/decisions/ADR-0005-week-definition-saturday-start.md`**: 変更不要
  （既に策定済み。本実装はこの ADR の決定に従う）。

---

## 手動テスト観点（実装後の動作確認）

| #   | ケース                                                | 手順                                                                                                                         | 期待結果                                                                                        |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| M-1 | `POST /api/meal-plans` 正常系                         | `curl -X POST http://localhost:3000/api/meal-plans -H 'Content-Type: application/json' -d '{"weekIdentifier":"2026-07-04"}'` | 201 + `MealPlanDto`（`status: "draft"`, `plannedRecipes: []`）                                  |
| M-2 | 同一週での冪等性確認                                  | M-1 と同じリクエストをもう一度送る                                                                                           | 201（または200。既存挙動に合わせる） + 同一 `id` の `MealPlanDto` が返り、DB に重複行がないこと |
| M-3 | `POST /api/meal-plans/:id/recipes` 正常系             | 作成した `id` に対して `curl -X POST .../recipes -d '{"recipeId":"<既存recipeId>","scaleFactor":1.5}'`                       | 201 + `PlannedRecipeDto`（`scaleFactor: 1.5`）                                                  |
| M-4 | `GET /api/meal-plans/current`                         | `curl http://localhost:3000/api/meal-plans/current`                                                                          | 200 + `{ "data": MealPlanDto }`（当該週が現在週の場合）                                         |
| M-5 | `GET /api/meal-plans/current`（該当なし）             | 未来の週のみ存在する状態で `curl`                                                                                            | 200 + `{ "data": null }`（204 ではない）                                                        |
| M-6 | `GET /api/meal-plans/history?limit=2`                 | `curl`                                                                                                                       | 200 + 最大 2 件の `MealPlanDto[]`（週の新しい順）                                               |
| M-7 | `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId` | `curl -X DELETE ...`                                                                                                         | 204。以後 `GET /current` で当該 PlannedRecipe が消えている                                      |
| M-8 | 存在しない `mealPlanId` で recipe 追加                | 不正な UUID の `id` を指定                                                                                                   | 404 + `{ "error": "MealPlan not found: ..." }`                                                  |
| M-9 | `scaleFactor: 0` で recipe 追加                       | `-d '{"recipeId":"...","scaleFactor":0}'`                                                                                    | 400（Zod バリデーション）                                                                       |
