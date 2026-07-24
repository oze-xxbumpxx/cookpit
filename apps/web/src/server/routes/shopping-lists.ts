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
  CompleteShoppingUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  MarkAsBoughtUseCase,
  ReassignStoreUseCase,
  ReopenShoppingListUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  mealPlanRepository,
  pantryRepository,
  productRepository,
  recipeRepository,
  shoppingListRepository,
} from '../repositories';

/** Generate は新規作成時 201、冪等な既存返却時 200 を返す。 */
export const shoppingListsRoute = new Hono()
  .post('/', zValidator('json', generateShoppingListSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new GenerateShoppingListUseCase(
      mealPlanRepository(),
      recipeRepository(),
      productRepository(),
      shoppingListRepository(),
      pantryRepository(),
    );
    const result = await usecase.execute(body);
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
  )
  .post('/:id/complete', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new CompleteShoppingUseCase(
      shoppingListRepository(),
      productRepository(),
      mealPlanRepository(),
    );
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  })
  .post('/:id/reopen', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new ReopenShoppingListUseCase(shoppingListRepository());
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  });
