# Task 5: Presentation 層 — Hono ルート 5 本 + app.ts 統合

## 概要

`apps/web/src/server/routes/shopping-lists.ts`（Hono・**5 エンドポイント**）を新規作成し、
`app.ts` にマウント + `onError` へ新規エラー 3 種の分岐を追記する。
**模範コード**: `apps/web/src/server/routes/meal-plans.ts` + `meal-plans.test.ts`
（手動 DI ファクトリ関数・`zValidator`・`vi.mock` によるルートテスト形式）。

依存: Task 2（`DrizzleShoppingListRepository`）・Task 3（UseCase 5 本 +
`GenerateShoppingListResultDto`）・Task 4（Zod スキーマ）すべて完了していること。

## アーキテクチャ制約（必ず遵守）

- Presentation 層は UseCase を呼ぶだけ。ドメインロジックを書かない
- UseCase の組み立て（手動 DI）はルート側で行う
- `any` 禁止 / default export 禁止（`app.ts` の既存 `export default app` は既存構造のため例外・
  変更しない）/ 型のみは `import type` / `===` `!==`
- **`app.ts` の `export const routes` は lint 回避で必要な既存構造。削除・変更しない**
- サーバーサイドのルートファイルのため **`'use client'` は不要**（付けない）
- 公開エクスポートのうち、型に表せない契約情報（エラー → HTTP ステータスの対応・
  冪等性など）がある場合のみ JSDoc を付ける（coding-standards.md 2026-07-12 改定。
  型の言い換えは書かない）

## 実装対象ファイル

| 種別 | ファイル                                            | 内容                                           |
| ---- | --------------------------------------------------- | ---------------------------------------------- |
| 新規 | `apps/web/src/server/routes/shopping-lists.ts`      | `shoppingListsRoute`（Hono、5 エンドポイント） |
| 新規 | `apps/web/src/server/routes/shopping-lists.test.ts` | Hono テストクライアントによるルートテスト      |
| 追記 | `apps/web/src/server/app.ts`                        | マウント + `onError` に新規エラー 3 種の分岐   |

## 1. `shoppingListsRoute`（そのまま実装）

```typescript
import { getDb } from '@/db/client';
import {
  addItemSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  shoppingItemIdParamSchema,
  shoppingListIdParamSchema,
} from '@cookpit/api-contract';
import {
  AddItemUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  MarkAsBoughtUseCase,
  ReassignStoreUseCase,
} from '@cookpit/application';
import {
  DrizzleMealPlanRepository,
  DrizzleProductRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
} from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function shoppingListRepository(): DrizzleShoppingListRepository {
  return new DrizzleShoppingListRepository(getDb());
}
function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}
function recipeRepository(): DrizzleRecipeRepository {
  return new DrizzleRecipeRepository(getDb());
}
function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(getDb());
}

export const shoppingListsRoute = new Hono()
  .post('/', zValidator('json', generateShoppingListSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new GenerateShoppingListUseCase(
      mealPlanRepository(),
      recipeRepository(),
      productRepository(),
      shoppingListRepository(),
    );
    const result = await usecase.execute(body);
    // 契約確定仕様 §10: 新規 201・冪等既存返却 200
    return c.json(result.shoppingList, result.created ? 201 : 200);
  })
  .get('/:id', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetShoppingListUseCase(shoppingListRepository());
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  })
  .post(
    '/:id/items',
    zValidator('param', shoppingListIdParamSchema),
    zValidator('json', addItemSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new AddItemUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, ...body });
      return c.json(dto, 201);
    },
  )
  .post(
    '/:id/items/:itemId/bought',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', markAsBoughtSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new MarkAsBoughtUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  )
  .post(
    '/:id/items/:itemId/target-store',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', reassignStoreSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new ReassignStoreUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  );
```

4 つの Drizzle Repository はすべて `@cookpit/infrastructure` からエクスポート済み
（`DrizzleShoppingListRepository` は Task 2 で追加）。既存 Repository の実装には触れない。

## 2. `app.ts` 追記（完成形。既存 6 分岐の順序・挙動は変更しない）

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { mealPlansRoute } from './routes/meal-plans';
import { productsRoute } from './routes/products';
import { recipesRoute } from './routes/recipes';
import { shoppingListsRoute } from './routes/shopping-lists';
import { storesRoute } from './routes/stores';
import {
  InvalidMealPlanStateError,
  InvalidShoppingListStateError,
  MealPlanNotFoundError,
  PlannedRecipeNotFoundError,
  ProductNotFoundError,
  RecipeNotFoundError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
  StoreNotFoundError,
} from '@cookpit/application';
const app = new Hono().basePath('/api');

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute)
  .route('/shopping-lists', shoppingListsRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ProductNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof MealPlanNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof PlannedRecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidMealPlanStateError) {
    return c.json({ error: err.message }, 422);
  }
  if (err instanceof ShoppingListNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ShoppingItemNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidShoppingListStateError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
```

新規 3 分岐（`ShoppingListNotFoundError` 404 / `ShoppingItemNotFoundError` 404 /
`InvalidShoppingListStateError` 422）は**既存 6 分岐の後・`console.error` の前**に追記する。

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- ルート変数名は **`shoppingListsRoute`**（複数形 + Route。`shoppingListRoute` にしない。
  既存の `mealPlansRoute`/`productsRoute` と同じ複数形規約）
- エンドポイントは **5 本**: `POST /` / `GET /:id` / `POST /:id/items` /
  `POST /:id/items/:itemId/bought` / `POST /:id/items/:itemId/target-store`。
  6 本目を作らない（一覧・削除・complete は Unit A スコープ外）
- パスセグメントの綴り: `bought` / `target-store`（ハイフン区切り。`targetStore` にしない）
- `result.created ? 201 : 200` の三項の向きに注意（逆にすると契約違反。テストで両方向を検証）
- イベント配線: 各ハンドラで `c.req.valid('param')` / `c.req.valid('json')` の**両方**を取り出す
  （`bought`/`target-store` は param + json の 2 バリデータ）

## テスト（`shopping-lists.test.ts`）

`meal-plans.test.ts`/`products.test.ts` と同じ形式: `vi.mock('@/db/client')` +
`vi.mock('@cookpit/application', ...)` で UseCase をモック化し、**ルートの入出力配線のみ**を検証
（Repository・DB 接続は行わない）。

- `POST /api/shopping-lists`: `GenerateShoppingListUseCase.execute` が呼ばれ、
  `result.created: true` で **201**・`created: false` で **200** が返ることを**個別に検証**
  （最重要観点）
- `GET /api/shopping-lists/:id`: 200 + `ShoppingListDto`
- `POST /api/shopping-lists/:id/items`: 201 + `ShoppingItemDto`
- `POST /api/shopping-lists/:id/items/:itemId/bought`: 200 + `ShoppingItemDto`
- `POST /api/shopping-lists/:id/items/:itemId/target-store`: 200 + `ShoppingItemDto`
- 各エンドポイントの 400（Zod バリデーション失敗）／404（`ShoppingListNotFoundError`/
  `ShoppingItemNotFoundError`/`MealPlanNotFoundError`）／422（`InvalidShoppingListStateError`/
  `InvalidMealPlanStateError`）

## 完了条件

- [ ] `pnpm --filter @cookpit/web type-check` 通過
- [ ] `pnpm --filter @cookpit/web test` 全 green
- [ ] `pnpm lint` 通過
- [ ] 5 エンドポイントすべてが契約確定仕様 §10 の表どおりの HTTP メソッド・パス・ステータスで動作
- [ ] `POST /api/shopping-lists` が新規生成時 201・冪等時 200 を返し分ける
- [ ] `app.ts` の既存 6 分岐（Recipe/Product/Store/MealPlan/PlannedRecipe/InvalidMealPlanState）が
      変更されていない
