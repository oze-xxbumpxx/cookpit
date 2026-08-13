import {
  addItemSchema,
  completeShoppingSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  setItemCheckedSchema,
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
  RemoveItemUseCase,
  ReopenShoppingListUseCase,
  SetItemCheckedUseCase,
  SyncShoppingListFromMealPlanUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createWriteContext, shoppingListRepository } from '../repositories';

/** Generate は新規作成時 201、冪等な既存返却時 200 を返す。 */
export const shoppingListsRoute = new Hono()
  .post('/', zValidator('json', generateShoppingListSchema), async (c) => {
    const body = c.req.valid('json');
    const { mealPlan, recipe, product, shoppingList, pantry, uow } = createWriteContext();
    const usecase = new GenerateShoppingListUseCase(
      mealPlan,
      recipe,
      product,
      shoppingList,
      pantry,
      uow,
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
      const { shoppingList, uow } = createWriteContext();
      const usecase = new AddItemUseCase(shoppingList, uow);
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
      const { shoppingList, uow } = createWriteContext();
      const usecase = new MarkAsBoughtUseCase(shoppingList, uow);
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  )
  .post(
    '/:id/items/:itemId/checked',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', setItemCheckedSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const { shoppingList, uow } = createWriteContext();
      const usecase = new SetItemCheckedUseCase(shoppingList, uow);
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
      const { shoppingList, uow } = createWriteContext();
      const usecase = new ReassignStoreUseCase(shoppingList, uow);
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  )
  .delete('/:id/items/:itemId', zValidator('param', shoppingItemIdParamSchema), async (c) => {
    const { id, itemId } = c.req.valid('param');
    const { shoppingList, uow } = createWriteContext();
    const usecase = new RemoveItemUseCase(shoppingList, uow);
    await usecase.execute({ shoppingListId: id, itemId });
    return c.body(null, 204);
  })
  .post(
    '/:id/complete',
    zValidator('param', shoppingListIdParamSchema),
    zValidator('json', completeShoppingSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const { shoppingList, pantry, product, mealPlan, uow } = createWriteContext();
      const usecase = new CompleteShoppingUseCase(shoppingList, pantry, product, mealPlan, uow);
      const dto = await usecase.execute({
        shoppingListId: id,
        stockAdditions: body.stockAdditions,
      });
      return c.json(dto, 200);
    },
  )
  .post('/:id/reopen', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const { shoppingList, uow } = createWriteContext();
    const usecase = new ReopenShoppingListUseCase(shoppingList, uow);
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  })
  .post('/:id/sync', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const { shoppingList, mealPlan, recipe, product, pantry, uow } = createWriteContext();
    const usecase = new SyncShoppingListFromMealPlanUseCase(
      shoppingList,
      mealPlan,
      recipe,
      product,
      pantry,
      uow,
    );
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  });
