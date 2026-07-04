# Task 4: Presentation 層 (API) — Zod スキーマ + Hono ルート

## 前提

Task 1〜3 が完了していること。

## 概要

API 契約（Zod スキーマ）を `packages/api-contract` に定義し、
Hono ルートを `apps/web/src/server/routes/` に実装する。
既存の Recipe API（`recipes.ts`）と同じパターンに従う。

## 実装対象ファイル

### 1. `packages/api-contract/src/product.schema.ts` — 新規

模範: `packages/api-contract/src/recipe.schema.ts`

```typescript
import { z } from 'zod';
import { unitSchema } from './recipe.schema';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

export const productCategorySchema = z.enum([
  '野菜',
  '肉',
  '魚',
  '調味料',
  '乾物',
  '冷凍',
  'その他',
]);

export const createProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

export const updateProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

export const recordPriceSchema = z.object({
  storeId: z.string().uuid(),
  priceAmount: z.number().positive(),
  packageSizeValue: z.number().positive(),
  packageSizeUnit: unitSchema,
});

export type ProductCategory = z.infer<typeof productCategorySchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type RecordPriceBody = z.infer<typeof recordPriceSchema>;
```

### 2. `packages/api-contract/src/store.schema.ts` — 新規

```typescript
import { z } from 'zod';

export const storeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export type StoreSchemaType = z.infer<typeof storeSchema>;
```

### 3. `packages/api-contract/src/index.ts` — 追記

既存行に変更なし。末尾に追記:

```typescript
export * from './product.schema';
export * from './store.schema';
```

### 4. `apps/web/src/server/routes/products.ts` — 新規

模範: `apps/web/src/server/routes/recipes.ts`

```typescript
import { getDb } from '@/db/client';
import { createProductSchema, updateProductSchema, recordPriceSchema } from '@cookpit/api-contract';
import {
  CreateProductUseCase,
  GetProductsUseCase,
  GetProductUseCase,
  UpdateProductUseCase,
  DeleteProductUseCase,
  RecordPriceUseCase,
  GetCheapestStoreUseCase,
} from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

function productRepository() {
  return new DrizzleProductRepository(getDb());
}

function storeRepository() {
  return new DrizzleStoreRepository(getDb());
}

const idParamSchema = z.object({ id: z.uuid() });

export const productsRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetProductsUseCase(productRepository(), storeRepository());
    const products = await usecase.execute();
    return c.json(products);
  })
  .post('/', zValidator('json', createProductSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new CreateProductUseCase(productRepository());
    const product = await usecase.execute(body);
    return c.json(product, 201);
  })
  .get('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetProductUseCase(productRepository(), storeRepository());
    const product = await usecase.execute(id);
    return c.json(product);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema),
    zValidator('json', updateProductSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new UpdateProductUseCase(productRepository(), storeRepository());
      const product = await usecase.execute({ id, ...body });
      return c.json(product);
    },
  )
  .delete('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new DeleteProductUseCase(productRepository());
    await usecase.execute(id);
    return c.body(null, 204);
  })
  .post(
    '/:id/price-records',
    zValidator('param', idParamSchema),
    zValidator('json', recordPriceSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new RecordPriceUseCase(productRepository(), storeRepository());
      await usecase.execute({ productId: id, ...body });
      return c.body(null, 200);
    },
  )
  .get('/:id/cheapest-store', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetCheapestStoreUseCase(productRepository(), storeRepository());
    const result = await usecase.execute(id);
    return c.json({ data: result });
  });
```

### 5. `apps/web/src/server/routes/stores.ts` — 新規

```typescript
import { getDb } from '@/db/client';
import { GetStoresUseCase } from '@cookpit/application';
import { DrizzleStoreRepository } from '@cookpit/infrastructure';
import { Hono } from 'hono';

function storeRepository() {
  return new DrizzleStoreRepository(getDb());
}

export const storesRoute = new Hono().get('/', async (c) => {
  const usecase = new GetStoresUseCase(storeRepository());
  const stores = await usecase.execute();
  return c.json(stores);
});
```

### 6. `apps/web/src/server/app.ts` — 追記

既存コード:

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { RecipeNotFoundError } from '@cookpit/application';
const app = new Hono().basePath('/api');

const routes = app.route('/health', healthRoute).route('/recipes', recipesRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
```

変更後:

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { productsRoute } from './routes/products';
import { storesRoute } from './routes/stores';
import {
  RecipeNotFoundError,
  ProductNotFoundError,
  StoreNotFoundError,
} from '@cookpit/application';
const app = new Hono().basePath('/api');

const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute);

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
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
```

`AppType` は `typeof routes` に自動反映されるため、追加作業不要。

## 完了条件

```bash
pnpm --filter @cookpit/api-contract type-check  # 通過
pnpm --filter @cookpit/web type-check           # 通過
pnpm lint                                        # 通過
```
