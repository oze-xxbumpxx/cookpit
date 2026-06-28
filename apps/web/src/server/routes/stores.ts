import { getDb } from '@/db/client';
import { createStoreSchema } from '@cookpit/api-contract';
import { CreateStoreUseCase, GetStoresUseCase } from '@cookpit/application';
import { DrizzleStoreRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function storeRepository(): DrizzleStoreRepository {
  return new DrizzleStoreRepository(getDb());
}

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
  });
