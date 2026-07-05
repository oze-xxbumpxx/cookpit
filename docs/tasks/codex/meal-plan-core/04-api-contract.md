# Task 4: API-Contract 層 — Zod スキーマの実装

## 概要

MealPlan API の Zod スキーマを実装する。`packages/api-contract` に Vitest が未導入のため、
先に導入してから契約を実装する。既存 `product.schema.ts`/`store.schema.ts` と同一の Zod v4 スタイルに従う。
Task 1〜3 と並行して着手できるが、レスポンススキーマは Task 3 の Mapper 出力構造と一致させること。

## アーキテクチャ制約

- 入出力スキーマは Zod で定義し API 契約として共有する
- `any` 禁止、型のみは `import type`
- zod は v4（`"zod": "^4.4.3"`）。v3 スタイル（`z.string().uuid()`、`z.string().date()`）ではなく
  v4 のトップレベル関数（`z.uuid()`、`z.iso.date()`、`z.iso.datetime()`、`z.coerce.number()`）を使う
  （既存 `product.schema.ts`/`store.schema.ts` と同一スタイル）

## 実装対象ファイル

### 1. `packages/api-contract/package.json`（既存ファイルへの追記。**必須**）

`devDependencies` に以下を追加する（`packages/domain/package.json` と同一バージョン）。

```json
"vitest": "^3.2.0"
```

`scripts` に以下を追加する。

```json
"test": "vitest run"
```

### 2. `packages/api-contract/vitest.config.ts`（新規。`packages/domain/vitest.config.ts` と一字一句同一）

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';

export default baseConfig;
```

### 3. `packages/api-contract/src/meal-plan.schema.ts`（新規）

```typescript
import z from 'zod';

export const createMealPlanSchema = z.object({
  weekIdentifier: z.iso.date(),
});

export const addRecipeToMealPlanSchema = z.object({
  recipeId: z.uuid(),
  scaleFactor: z.number().positive(),
});

export const mealPlanIdParamSchema = z.object({
  id: z.uuid(),
});

export const plannedRecipeIdParamSchema = z.object({
  id: z.uuid(),
  plannedRecipeId: z.uuid(),
});

export const getMealPlanHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export const mealPlanStatusSchema = z.enum(['draft', 'shopping', 'cooking', 'consuming', 'completed']);

export const plannedRecipeResponseSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  scaleFactor: z.number(),
  scheduledDate: z.iso.date().nullable(),
  cookedAt: z.iso.datetime().nullable(),
  notes: z.string(),
});

export const mealPlanResponseSchema = z.object({
  id: z.uuid(),
  weekIdentifier: z.iso.date(),
  status: mealPlanStatusSchema,
  plannedRecipes: z.array(plannedRecipeResponseSchema),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const getCurrentMealPlanResponseSchema = z.object({
  data: mealPlanResponseSchema.nullable(),
});

export const mealPlanHistoryResponseSchema = z.array(mealPlanResponseSchema);

export const errorResponseSchema = z.object({
  error: z.string(),
});

export type CreateMealPlanBody = z.infer<typeof createMealPlanSchema>;
export type AddRecipeToMealPlanBody = z.infer<typeof addRecipeToMealPlanSchema>;
export type MealPlanIdParam = z.infer<typeof mealPlanIdParamSchema>;
export type PlannedRecipeIdParam = z.infer<typeof plannedRecipeIdParamSchema>;
export type GetMealPlanHistoryQuery = z.infer<typeof getMealPlanHistoryQuerySchema>;
export type MealPlanStatusSchemaType = z.infer<typeof mealPlanStatusSchema>;
export type PlannedRecipeResponse = z.infer<typeof plannedRecipeResponseSchema>;
export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
export type GetCurrentMealPlanResponse = z.infer<typeof getCurrentMealPlanResponseSchema>;
export type MealPlanHistoryResponse = z.infer<typeof mealPlanHistoryResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
```

**注意点**:

- `weekIdentifier` の**曜日（土曜であること）検証は行わない**（Domain 側 `WeekIdentifier.fromString` も
  曜日検証をしないため。R-5: 非土曜日を許容する問題はMVP1では対応不要、変更しない）
- `scaleFactor` の上限は設けない。`Infinity` が `positive()` を通過し得るが対応不要（R-6）
- `mealPlanIdParamSchema` と `plannedRecipeIdParamSchema` はフィールドが一部重複するが、
  パスパラメータの数が異なるため統合せず別スキーマとして定義する
- レスポンススキーマ（`mealPlanResponseSchema` 等）は Hono の `zValidator` には使わない
  （既存 `products.ts`/`stores.ts` と同様、UseCase の戻り値型で型安全性を担保し、レスポンススキーマは
  契約テスト専用）

### 4. `packages/api-contract/src/meal-plan.schema.test.ts`（新規）

- 正常な `weekIdentifier`（`"2026-07-04"`）が `createMealPlanSchema.parse()` を通過する
- 不正フォーマット（`"2026/07/04"`）・不正暦日（`"2026-13-01"`、`"2026-02-30"`）が reject される
- 閏年の `"2028-02-29"` は accept される
- `recipeId`/`id`/`plannedRecipeId` の UUID 不正が reject される
- `scaleFactor`: `0`/負数は reject、`0.001`/`3` は accept
- `limit`: `"1"`→`1`、`"12"`→`12`（accept）、`"13"`→reject、`"0"`→reject、`""`→reject、`"abc"`→reject、
  `"2.5"`→reject、未指定時→デフォルト `4`
- `mealPlanResponseSchema`/`plannedRecipeResponseSchema` が Task 3 の Mapper（`toMealPlanDto`/
  `toPlannedRecipeDto`）の出力形と一致する（`parse()` が通る）ことを型往復テストで検証
  （`plannedRecipes` 複数件・`scheduledDate`/`cookedAt` が値ありのケースと `null` のケース両方）
- `getCurrentMealPlanResponseSchema.parse({ data: null })` が成功する（D-4）
- 既存 `product.schema.ts`/`store.schema.ts`/`recipe.schema.ts` に変更がないこと（後方互換確認）

### 5. `packages/api-contract/src/index.ts`（既存ファイルへの追記）

```typescript
export * from './meal-plan.schema';
```

## 完了条件

```bash
pnpm --filter @cookpit/api-contract test        # 導入後に green で実行可能になること
pnpm --filter @cookpit/api-contract type-check  # 通過
pnpm lint
```

- `packages/api-contract` で `pnpm test` が実行可能になっている（Vitest 導入完了）
- 既存 `product.schema.ts`/`store.schema.ts`/`recipe.schema.ts` の型・エクスポートに変更がないこと
