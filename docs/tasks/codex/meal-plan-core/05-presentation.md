# Task 5: Presentation 層（API） — Hono ルートの実装

## 概要

MealPlan の Hono ルート5本を実装し `app.ts` にマウントする。既存 `products.ts`/`stores.ts` と
同一の手動 DI ファクトリパターンを踏襲する。**Task 3（Application）・Task 4（API-Contract）完了が前提**。
画面(UI)は対象外（Unit B）。

## アーキテクチャ制約

- Presentation 層は UseCase を呼ぶだけ。ドメインロジックを Presentation に書かない
- Hono ルートの型はフロントから `import type` で取り込み、型安全に呼び出す（Hono RPC。本タスクでは
  バックエンド側の実装のみ）
- UseCase の組み立て（手動 DI）は呼び出し側（ルート）で行う
- `'use client'` は不要（サーバーサイドの Hono ルートのため React コンポーネントではない）

## 実装対象ファイル

### 1. `apps/web/src/server/routes/meal-plans.ts`（新規）

**模範コード**: `apps/web/src/server/routes/products.ts` と同一の手動 DI ファクトリパターン。

```typescript
import { getDb } from '@/db/client';
import {
  addRecipeToMealPlanSchema,
  createMealPlanSchema,
  getMealPlanHistoryQuerySchema,
  mealPlanIdParamSchema,
  plannedRecipeIdParamSchema,
} from '@cookpit/api-contract';
import {
  AddRecipeToMealPlanUseCase,
  CreateMealPlanUseCase,
  GetCurrentMealPlanUseCase,
  GetMealPlanHistoryUseCase,
  RemoveRecipeFromMealPlanUseCase,
} from '@cookpit/application';
import { DrizzleMealPlanRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}

export const mealPlansRoute = new Hono()
  .post('/', zValidator('json', createMealPlanSchema), async (c) => {
    const body = c.req.valid('json');
    const useCase = new CreateMealPlanUseCase(mealPlanRepository());
    const dto = await useCase.execute(body);
    return c.json(dto, 201);
  })
  .get('/current', async (c) => {
    const useCase = new GetCurrentMealPlanUseCase(mealPlanRepository());
    const dto = await useCase.execute();
    return c.json({ data: dto }); // D-4: MealPlan なしでも 200 + { data: null }（204 にしない）
  })
  .get('/history', zValidator('query', getMealPlanHistoryQuerySchema), async (c) => {
    const { limit } = c.req.valid('query');
    const useCase = new GetMealPlanHistoryUseCase(mealPlanRepository());
    const dtos = await useCase.execute({ limit });
    return c.json(dtos);
  })
  .post(
    '/:id/recipes',
    zValidator('param', mealPlanIdParamSchema),
    zValidator('json', addRecipeToMealPlanSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const useCase = new AddRecipeToMealPlanUseCase(mealPlanRepository());
      const dto = await useCase.execute({ mealPlanId: id, ...body });
      return c.json(dto, 201);
    },
  )
  .delete(
    '/:id/recipes/:plannedRecipeId',
    zValidator('param', plannedRecipeIdParamSchema),
    async (c) => {
      const { id, plannedRecipeId } = c.req.valid('param');
      const useCase = new RemoveRecipeFromMealPlanUseCase(mealPlanRepository());
      await useCase.execute({ mealPlanId: id, plannedRecipeId });
      return c.body(null, 204);
    },
  );
```

### 2. `apps/web/src/server/app.ts`（既存ファイルへの追記。3箇所）

**import 追加**（既存 import 群に追加）:

```typescript
import { mealPlansRoute } from './routes/meal-plans';
import {
  MealPlanNotFoundError,
  PlannedRecipeNotFoundError,
  InvalidMealPlanStateError,
} from '@cookpit/application';
```

（既存の `import { ProductNotFoundError, RecipeNotFoundError, StoreNotFoundError } from '@cookpit/application';`
と統合するか、上記のように追加 import してもよい。既存 import 文を削除しないこと）

**ルート追加**（既存 `.route()` チェーンに追加。既存3行は変更しない）:

```typescript
export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute); // 追加
```

**onError 追加**（既存 `onError` 内、`console.error(err)` の前に3分岐を追加。既存3分岐
（Recipe/Product/Store）は変更しない）:

```typescript
if (err instanceof MealPlanNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof PlannedRecipeNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof InvalidMealPlanStateError) {
  return c.json({ error: err.message }, 422);
}
```

## 命名・記法の注意

- `GET /api/meal-plans/current` は MealPlan が無くても**必ず 200**（`{ data: null }`）を返す。
  `c.body(null, 204)` にしない（D-4。既存 `GetCheapestStoreUseCase` の `{ data: result }` パターンと同型）
- `DELETE /:id/recipes/:plannedRecipeId` は成功時 `c.body(null, 204)`（既存 `DELETE /:id` と同じ）

## テスト

### `apps/web/src/server/routes/meal-plans.test.ts`

**模範コード**: `apps/web/src/server/routes/products.test.ts`。`vi.mock('@/db/client')` +
`vi.mock('@cookpit/application', ...)` で5 UseCase をモック化し、Repository/DB 接続を経由せず
配線のみを検証する。

- `POST /api/meal-plans`: 正常な body で 201 + `MealPlanDto`。`execute` に渡る引数を検証
- `POST /api/meal-plans`: `weekIdentifier` 不正フォーマット（`"2026/07/04"`）で 400。`execute` は呼ばれない
- `GET /api/meal-plans/current`: UseCase が `MealPlanDto` を返すモックで 200 + `{ data: MealPlanDto }`
- `GET /api/meal-plans/current`: UseCase が `null` を返すモックで **200**（204 ではない）+ `{ data: null }`
- `GET /api/meal-plans/history?limit=4`: 200 + `MealPlanDto[]`。`execute` に `{ limit: 4 }` が渡ることを確認
- `GET /api/meal-plans/history?limit=13`: 400（Zod `.max(12)` 違反）
- `POST /api/meal-plans/:id/recipes`: 正常な body で 201 + `PlannedRecipeDto`
- `POST /api/meal-plans/:id/recipes`: `id` が UUID 形式でない場合 400
- `POST /api/meal-plans/:id/recipes`: `scaleFactor: 0`・`scaleFactor: -1` で 400（Zod、UseCase 到達前に reject）
- `POST /api/meal-plans/:id/recipes`: UseCase が `MealPlanNotFoundError` を reject → 404
- `POST /api/meal-plans/:id/recipes`: UseCase が `InvalidMealPlanStateError` を reject → 422
- `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId`: 正常終了で204。`execute` の引数を確認
- 同上: `MealPlanNotFoundError`→404、`PlannedRecipeNotFoundError`→404、`InvalidMealPlanStateError`→422
- **回帰確認**: `mealPlansRoute` マウント後も `GET /api/health`・`GET /api/recipes`・`GET /api/products`・
  `GET /api/stores` の既存レスポンスが変わらないこと。既存の `RecipeNotFoundError`/`ProductNotFoundError`/
  `StoreNotFoundError` の404挙動が変わらないこと

## 完了条件

```bash
pnpm --filter @cookpit/web test        # 全 green
pnpm --filter @cookpit/web type-check  # 通過
pnpm lint
```

- 5 エンドポイント全てが仕様通りの HTTP メソッド・パス・ステータスで動作する
- `GET /api/meal-plans/current` が MealPlan なしでも 200 + `{ data: null }` を返す（204 にしない）
- `app.ts` の既存3エラー分岐（Recipe/Product/Store）・既存3ルートが変更されていない

---

## 全タスク完了後の手動確認（推奨）

`pnpm dev` 起動後、以下を `curl` で確認する。

```bash
curl -X POST http://localhost:3000/api/meal-plans -H 'Content-Type: application/json' \
  -d '{"weekIdentifier":"2026-07-04"}'
# → 201 + MealPlanDto（status: "draft", plannedRecipes: []）

curl http://localhost:3000/api/meal-plans/current
# → 200 + { "data": MealPlanDto | null }
```

同一リクエストをもう一度送って、重複作成されず同一 `id` が返ること（冪等性）も確認する。
