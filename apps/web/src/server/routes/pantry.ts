import {
  addStockSchema,
  consumeStockSchema,
  stockIdParamSchema,
  updateStockSchema,
} from '@cookpit/api-contract';
import {
  AddStockUseCase,
  ConsumeStockUseCase,
  DiscardStockUseCase,
  GetPantryUseCase,
  UpdateStockDetailsUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { pantryRepository, createWriteContext } from '../repositories';

export const pantryRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetPantryUseCase(pantryRepository());
    const dto = await usecase.execute();
    return c.json(dto, 200);
  })
  .post('/stocks', zValidator('json', addStockSchema), async (c) => {
    const body = c.req.valid('json');
    const { pantry, uow } = createWriteContext();
    const usecase = new AddStockUseCase(pantry, uow);
    const dto = await usecase.execute(body);
    return c.json(dto, 201);
  })
  .post(
    '/stocks/:stockId/consume',
    zValidator('param', stockIdParamSchema),
    zValidator('json', consumeStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const { pantry, uow } = createWriteContext();
      const usecase = new ConsumeStockUseCase(pantry, uow);
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  )
  .post('/stocks/:stockId/discard', zValidator('param', stockIdParamSchema), async (c) => {
    const { stockId } = c.req.valid('param');
    const { pantry, uow } = createWriteContext();
    const usecase = new DiscardStockUseCase(pantry, uow);
    const dto = await usecase.execute({ stockId });
    return c.json(dto, 200);
  })
  .put(
    '/stocks/:stockId',
    zValidator('param', stockIdParamSchema),
    zValidator('json', updateStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const { pantry, uow } = createWriteContext();
      const usecase = new UpdateStockDetailsUseCase(pantry, uow);
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  );
