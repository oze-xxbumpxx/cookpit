import { getDb } from '@/db/client';
import { createProductSchema, recordPriceSchema, updateProductSchema } from '@cookpit/api-contract';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  GetCheapestStoreUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  RecordPriceUseCase,
  UpdateProductUseCase,
} from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(getDb());
}

function storeRepository(): DrizzleStoreRepository {
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
