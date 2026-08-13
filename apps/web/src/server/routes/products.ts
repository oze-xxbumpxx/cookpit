import {
  createProductSchema,
  idParamSchema,
  priceRecordIdParamSchema,
  recordPriceSchema,
  updatePriceRecordSchema,
  updateProductSchema,
} from '@cookpit/api-contract';
import {
  CreateProductUseCase,
  DeletePriceRecordUseCase,
  DeleteProductUseCase,
  GetCheapestStoreUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  RecordPriceUseCase,
  UpdatePriceRecordUseCase,
  UpdateProductUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { productRepository, storeRepository, createWriteContext } from '../repositories';

export const productsRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetProductsUseCase(productRepository(), storeRepository());
    const products = await usecase.execute();
    return c.json(products);
  })
  .post('/', zValidator('json', createProductSchema), async (c) => {
    const body = c.req.valid('json');
    const ctx = createWriteContext();
    const usecase = new CreateProductUseCase(ctx.product, ctx.uow);
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
      const ctx = createWriteContext();
      const usecase = new UpdateProductUseCase(ctx.product, ctx.store, ctx.uow);
      const product = await usecase.execute({ id, ...body });
      return c.json(product);
    },
  )
  .delete('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const { product, uow } = createWriteContext();
    const usecase = new DeleteProductUseCase(product, uow);
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
      const { product, store, uow } = createWriteContext();
      const usecase = new RecordPriceUseCase(product, store, uow);
      await usecase.execute({ productId: id, ...body });
      return c.body(null, 200);
    },
  )
  .put(
    '/:id/price-records/:priceRecordId',
    zValidator('param', priceRecordIdParamSchema),
    zValidator('json', updatePriceRecordSchema),
    async (c) => {
      const { id, priceRecordId } = c.req.valid('param');
      const body = c.req.valid('json');
      const ctx = createWriteContext();
      const usecase = new UpdatePriceRecordUseCase(ctx.product, ctx.store, ctx.uow);
      const product = await usecase.execute({ productId: id, priceRecordId, ...body });
      return c.json(product);
    },
  )
  .delete(
    '/:id/price-records/:priceRecordId',
    zValidator('param', priceRecordIdParamSchema),
    async (c) => {
      const { id, priceRecordId } = c.req.valid('param');
      const { product, uow } = createWriteContext();
      const usecase = new DeletePriceRecordUseCase(product, uow);
      await usecase.execute({ productId: id, priceRecordId });
      return c.body(null, 204);
    },
  )
  .get('/:id/cheapest-store', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetCheapestStoreUseCase(productRepository(), storeRepository());
    const result = await usecase.execute(id);
    return c.json({ data: result });
  });
