import {
  addRecipeToMealPlanSchema,
  createMealPlanSchema,
  getMealPlanHistoryQuerySchema,
  mealPlanIdParamSchema,
  plannedRecipeIdParamSchema,
} from '@cookpit/api-contract';
import {
  AddRecipeToMealPlanUseCase,
  CreateMealPlanUseCase,
  GetCurrentMealPlanUseCase,
  GetMealPlanHistoryUseCase,
  RemoveRecipeFromMealPlanUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { mealPlanRepository, createWriteContext } from '../repositories';

export const mealPlansRoute = new Hono()
  .post('/', zValidator('json', createMealPlanSchema), async (c) => {
    const body = c.req.valid('json');
    const ctx = createWriteContext();
    const usecase = new CreateMealPlanUseCase(ctx.mealPlan, ctx.uow);
    const mealPlan = await usecase.execute(body);
    return c.json(mealPlan, 201);
  })
  .get('/current', async (c) => {
    const usecase = new GetCurrentMealPlanUseCase(mealPlanRepository());
    const mealPlan = await usecase.execute();
    return c.json({ data: mealPlan });
  })
  .get('/history', zValidator('query', getMealPlanHistoryQuerySchema), async (c) => {
    const { limit } = c.req.valid('query');
    const usecase = new GetMealPlanHistoryUseCase(mealPlanRepository());
    const mealPlans = await usecase.execute({ limit });
    return c.json(mealPlans);
  })
  .post(
    '/:id/recipes',
    zValidator('param', mealPlanIdParamSchema),
    zValidator('json', addRecipeToMealPlanSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const { mealPlan, uow } = createWriteContext();
      const usecase = new AddRecipeToMealPlanUseCase(mealPlan, uow);
      const plannedRecipe = await usecase.execute({ mealPlanId: id, ...body });
      return c.json(plannedRecipe, 201);
    },
  )
  .delete(
    '/:id/recipes/:plannedRecipeId',
    zValidator('param', plannedRecipeIdParamSchema),
    async (c) => {
      const { id, plannedRecipeId } = c.req.valid('param');
      const { mealPlan, uow } = createWriteContext();
      const usecase = new RemoveRecipeFromMealPlanUseCase(mealPlan, uow);
      await usecase.execute({ mealPlanId: id, plannedRecipeId });
      return c.body(null, 204);
    },
  );
