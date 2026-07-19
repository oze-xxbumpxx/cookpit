import { getDb } from '@/db/client';
import { consumeStockSchema, stockIdParamSchema } from '@cookpit/api-contract';
import { ConsumeStockUseCase, DiscardStockUseCase, GetPantryUseCase } from '@cookpit/application';
import { DrizzlePantryRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

export const pantryRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetPantryUseCase(pantryRepository());
    const dto = await usecase.execute();
    return c.json(dto, 200);
  })
  .post(
    '/stocks/:stockId/consume',
    zValidator('param', stockIdParamSchema),
    zValidator('json', consumeStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new ConsumeStockUseCase(pantryRepository());
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  )
  .post('/stocks/:stockId/discard', zValidator('param', stockIdParamSchema), async (c) => {
    const { stockId } = c.req.valid('param');
    const usecase = new DiscardStockUseCase(pantryRepository());
    const dto = await usecase.execute({ stockId });
    return c.json(dto, 200);
  });
