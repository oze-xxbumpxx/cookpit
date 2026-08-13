import { createStoreSchema, idParamSchema, renameStoreSchema } from '@cookpit/api-contract';
import {
  CreateStoreUseCase,
  DeleteStoreUseCase,
  GetStoresUseCase,
  GetStoreUsageUseCase,
  RenameStoreUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  productRepository,
  shoppingListRepository,
  storeRepository,
  createWriteContext,
} from '../repositories';

export const storesRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetStoresUseCase(storeRepository());
    const stores = await usecase.execute();
    return c.json(stores);
  })
  .post('/', zValidator('json', createStoreSchema), async (c) => {
    const body = c.req.valid('json');
    const ctx = createWriteContext();
    const usecase = new CreateStoreUseCase(ctx.store, ctx.uow);
    const store = await usecase.execute(body);
    return c.json(store, 201);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema),
    zValidator('json', renameStoreSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const ctx = createWriteContext();
      const usecase = new RenameStoreUseCase(ctx.store, ctx.uow);
      const store = await usecase.execute({ id, ...body });
      return c.json(store);
    },
  )
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
    const { store, product, shoppingList, uow } = createWriteContext();
    const usecase = new DeleteStoreUseCase(store, product, shoppingList, uow);
    await usecase.execute(id);
    return c.body(null, 204);
  });
