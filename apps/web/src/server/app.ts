import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { mealPlansRoute } from './routes/meal-plans';
import { productsRoute } from './routes/products';
import { recipesRoute } from './routes/recipes';
import { storesRoute } from './routes/stores';
import {
  InvalidMealPlanStateError,
  MealPlanNotFoundError,
  PlannedRecipeNotFoundError,
  ProductNotFoundError,
  RecipeNotFoundError,
  StoreNotFoundError,
} from '@cookpit/application';
const app = new Hono().basePath('/api');

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ProductNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof MealPlanNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof PlannedRecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidMealPlanStateError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
