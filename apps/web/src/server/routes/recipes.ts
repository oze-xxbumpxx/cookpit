import { createRecipeSchema, idParamSchema, updateRecipeSchema } from '@cookpit/api-contract';
import {
  CreateRecipeUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  GetRecipesUseCase,
  UpdateRecipeUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { recipeRepository } from '../repositories';

export const recipesRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetRecipesUseCase(recipeRepository());
    const recipes = await usecase.execute();
    return c.json(recipes);
  })
  .get('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetRecipeUseCase(recipeRepository());
    const recipe = await usecase.execute(id);
    return c.json(recipe);
  })
  .post('/', zValidator('json', createRecipeSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new CreateRecipeUseCase(recipeRepository());
    const recipe = await usecase.execute(body);
    return c.json(recipe, 201);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema),
    zValidator('json', updateRecipeSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new UpdateRecipeUseCase(recipeRepository());
      const recipe = await usecase.execute({ id, ...body });
      return c.json(recipe);
    },
  )
  .delete('/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new DeleteRecipeUseCase(recipeRepository());
    await usecase.execute(id);
    return c.body(null, 204);
  });
