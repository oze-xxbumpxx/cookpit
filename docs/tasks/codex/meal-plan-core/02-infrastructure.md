# Task 2: Infrastructure 層 — DB スキーマ・Repository の実装

## 概要

`meal_plans`/`planned_recipes` テーブルを追加し、`DrizzleMealPlanRepository` を実装する。
既存 `DrizzleProductRepository`（`packages/infrastructure/src/repositories/drizzle-product.repository.ts`）
の JOIN 復元・`onConflictDoUpdate` + `notInArray` 削除パターンを完全に踏襲する。**Task 1（Domain）完了が前提**。

## アーキテクチャ制約

- DB スキーマ形 ⇔ ドメインモデル形の変換責任は Repository 実装が持つ。Domain 層は DB の形を知らない
- `any` 禁止、型のみは `import type`、値なしは `null`
- Repository は `DrizzleClient` をコンストラクタ注入で受け取る（手動 DI）

## 実装対象ファイル

### 1. `packages/infrastructure/src/db/schema.ts`（既存ファイルへの追記）

先頭の import に `date` を追加（既存 `index, integer, jsonb, numeric, pgTable, text, timestamp` に追加）。
末尾に以下を追記する（既存4テーブル定義は変更しない）。

```typescript
export const mealPlans = pgTable('meal_plans', {
  id: text('id').primaryKey(),
  weekStartDate: date('week_start_date').notNull().unique(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export type MealPlanRow = typeof mealPlans.$inferSelect;
export type NewMealPlanRow = typeof mealPlans.$inferInsert;

export const plannedRecipes = pgTable(
  'planned_recipes',
  {
    id: text('id').primaryKey(),
    mealPlanId: text('meal_plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id').notNull(),
    scaleFactor: numeric('scale_factor', { precision: 10, scale: 3 }).notNull(),
    scheduledDate: date('scheduled_date'),
    cookedAt: timestamp('cooked_at'),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('planned_recipes_meal_plan_id_idx').on(table.mealPlanId)],
);

export type PlannedRecipeRow = typeof plannedRecipes.$inferSelect;
export type NewPlannedRecipeRow = typeof plannedRecipes.$inferInsert;
```

**注意**: `recipeId` は外部キー制約を張らない（`Recipe` 集約への参照は ID 参照のみ。削除済み Recipe への
参照を保持し続けるため。C-4 参照）。`weekStartDate` は `unique()` 制約付き（C-3: 冪等性の DB 側保証）。

### 2. `packages/infrastructure/src/testing/create-test-db.ts`（既存ファイルへの追記。**必須。省略するとTask実装の全テストがDBエラーで失敗する**）

`DDL` 定数の末尾（`price_records_product_id_idx` のインデックス作成文の後）に以下を追記する。
既存の4テーブル分の DDL は変更しない。

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

カラム名・型・制約を schema.ts の Drizzle 定義と完全一致させること（特に `numeric(10, 3)`）。

### 3. マイグレーション生成

**実行コマンド**（プロジェクト直下に `db:generate` は無いため `apps/web` を `--filter` で指定する）:

```bash
pnpm --filter @cookpit/web db:generate
```

**生成先**: `apps/web/src/db/migrations/`（`apps/web/drizzle.config.ts` の `out: './src/db/migrations'`
設定による。`packages/infrastructure/src/db/migrations/` ではないので注意）。

- 生成された `.sql` に `CREATE TABLE "meal_plans"` と `CREATE TABLE "planned_recipes"` が含まれること
- `meta/_journal.json` に新しいエントリが追記され、既存 `0000`〜`0004` のエントリは変更しないこと
- 既存4テーブルへの `ALTER` 文が含まれないこと
- 生成ファイルは手動編集せずそのままコミット対象とする

### 4. `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`（新規）

**模範コード**: `packages/infrastructure/src/repositories/drizzle-product.repository.ts` の
`toProducts()` グルーピングロジック・`save()` の upsert + `notInArray` 削除パターンを完全に踏襲する。

```typescript
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { MealPlan, PlannedRecipe } from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import { PlannedRecipeId } from '@cookpit/domain/src/meal-plan/planned-recipe-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import type { DrizzleClient } from '../db/client';
import {
  mealPlans,
  plannedRecipes,
  type NewMealPlanRow,
  type NewPlannedRecipeRow,
  type MealPlanRow,
  type PlannedRecipeRow,
} from '../db/schema';

export class DrizzleMealPlanRepository implements MealPlanRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: MealPlanId): Promise<MealPlan | null> {
    /* ... */
  }
  async findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null> {
    /* ... */
  }
  async findRecent(limit: number): Promise<MealPlan[]> {
    /* ... */
  }
  async save(mealPlan: MealPlan): Promise<void> {
    /* ... */
  }

  private toMealPlans(rows: /* leftJoin 結果の行型 */ []): MealPlan[] {
    /* グルーピング */
  }
  private toEntity(mealPlanRow: MealPlanRow, plannedRecipeRows: PlannedRecipeRow[]): MealPlan {
    /* ... */
  }
}
```

**実装要点（正確に従うこと）**:

- `findById`/`findByWeek`: `mealPlans` と `plannedRecipes` を `leftJoin` し、`toMealPlans()` でグルーピングして
  `MealPlan.reconstruct()` に変換する（`DrizzleProductRepository.toProducts()`/`toEntity()` と同一構造）
- `findRecent(limit)`: `ORDER BY meal_plans.week_start_date DESC` で**全件** JOIN 取得 → グルーピング →
  `slice(0, limit)`。**DB の `.limit(limit)` を JOIN 済みクエリに直接付けてはいけない**
  （JOIN で行が膨らむため、本来の MealPlan 件数と一致しなくなる。MVP1 規模では全件取得後にアプリ側で
  グルーピング・スライスする方式で十分）
- `save(mealPlan)`:
  1. `mealPlans` を `onConflictDoUpdate`（target: `id`。`set` に **`weekStartDate` は含めない** — 週は
     不変フィールドのため upsert 対象外。`status`/`completedAt` のみ更新）
  2. 現在の `plannedRecipes` の ID リストを取得 → `notInArray` で不要行を DELETE
     （`currentIds.length === 0` の場合は `mealPlanId` 一致行を全 DELETE。`DrizzleProductRepository.save()`
     の分岐と同一パターン）
  3. 各 `plannedRecipe` を `onConflictDoUpdate` で upsert
- ドメイン→DB マッピング: `mealPlan.weekOf.toString()` → `weekStartDate`、`plannedRecipe.scaleFactor` →
  `scaleFactor`（`number` → Drizzle は文字列で受け取る。`.toString()` する）
- DB→ドメイン マッピング: `WeekIdentifier.fromString(row.weekStartDate)` で `weekOf` を復元、
  `scaleFactor: Number(row.scaleFactor)`（**`numeric` カラムは Drizzle では文字列で返るため必ず `Number()`
  変換する**。`DrizzleProductRepository` の `priceAmount`/`unitPriceAmount`/`packageSizeValue` と同一パターン）、
  `scheduledDate: row.scheduledDate ? new Date(row.scheduledDate + 'T00:00:00') : null`（**`date` 型カラムは
  必ず `'T00:00:00'` を付与してから `new Date()` する**。付与しないと UTC 深夜として解釈されローカル日付が
  前日にずれるリスクがある）、`cookedAt: row.cookedAt ?? null`

### 5. `packages/infrastructure/src/index.ts`（既存ファイルへの追記）

```typescript
export * from './repositories/drizzle-meal-plan.repository';
```

## 命名・記法の注意

- `numeric` カラムの読み出しは全て `Number()` 変換を入れる（漏らすと DTO 側で文字列型のまま返る）
- `date` 型カラムの読み出しは全て `+ 'T00:00:00'` を付与してから `new Date()` する
- テーブル名は複数形（`meal_plans`/`planned_recipes`）

## テスト

### `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.test.ts`

PGlite 統合テスト（`packages/infrastructure/src/testing/create-test-db.ts` の `createTestDb()` を使用。
既存 `drizzle-product.repository.test.ts` のセットアップパターンを踏襲）。

- `save()` → `findById()`: `plannedRecipes` 込みで正しく復元される（`weekOf`/`status`/`plannedRecipes` 一致）
- 空DBで `findById()`/`findByWeek()` → `null`
- `findByWeek()`: 保存済みの週で取得できる
- `findRecent(limit)`: 週開始日の新しい順で `limit` 件返る。**JOIN 行膨張対策の確認が重要**
  — 1つの MealPlan に `plannedRecipes` を複数件持たせ、他に別週の MealPlan がある状態で
  `findRecent(1)` を呼んでも `MealPlan` としては正しく1件のみ返ることを検証する
- `findRecent()`: DB の件数が `limit` より少なくてもエラーなく実件数を返す
- `save()` を同一 `id` で2回呼ぶと `meal_plans` は1行のまま `status` が更新される（`weekStartDate` は
  変化しないことも確認）
- ドメイン側で `removeRecipe()` した `MealPlan` を再 `save()` すると `planned_recipes` から該当行が
  `DELETE` される
- `scaleFactor: 1.5` を保存 → 復元後に `number` 型の `1.5`（文字列のまま返らないことを確認）
- `weekOf`/`scheduledDate` の往復でタイムゾーンのズレがないこと（`toString()` した値が保存前後で一致）
- `cookedAt`/`completedAt` が `null` の場合、復元後も `null`（`undefined` にならない）
- `notes: ''` が往復する（空文字許容）

## 完了条件

```bash
pnpm --filter @cookpit/infrastructure test        # 全 green
pnpm --filter @cookpit/infrastructure type-check  # 通過
pnpm lint
```

- `schema.ts`/`create-test-db.ts` に既存4テーブル分の変更がないこと
- `MealPlanRepository` の4メソッド全てが実装され、`findRecent` が JOIN 後グルーピング→`slice`の順で
  実装されていること（DB LIMIT に依存しない）
- `save()` が `weekStartDate` を upsert の `set` に含めていないこと
