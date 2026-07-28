import { createStoreSchema, idParamSchema } from '@cookpit/api-contract';
import {
  CreateStoreUseCase,
  DeleteStoreUseCase,
  GetStoresUseCase,
  GetStoreUsageUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { productRepository, shoppingListRepository, storeRepository } from '../repositories';

export const storesRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetStoresUseCase(storeRepository());
    const stores = await usecase.execute();
    return c.json(stores);
  })
  .post('/', zValidator('json', createStoreSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new CreateStoreUseCase(storeRepository());
    const store = await usecase.execute(body);
    return c.json(store, 201);
  })
  // 削除で失われる件数の事前提示用（ADR-0013）。削除の可否判定には使わない。
  .get('/:id/usage', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetStoreUsageUseCase(
      storeRepository(),
      productRepository(),
      shoppingListRepository(),
    );
    const usage = await usecase.execute(id);
    return c.json(usage);
  })
  .delete('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new DeleteStoreUseCase(
      storeRepository(),
      productRepository(),
      shoppingListRepository(),
    );
    await usecase.execute(id);
    return c.body(null, 204);
  });
