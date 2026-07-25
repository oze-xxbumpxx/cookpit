import { InvalidOperationError, NotFoundError } from '@cookpit/application';
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { mealPlansRoute } from './routes/meal-plans';
import { pantryRoute } from './routes/pantry';
import { productsRoute } from './routes/products';
import { recipesRoute } from './routes/recipes';
import { shoppingListsRoute } from './routes/shopping-lists';
import { storesRoute } from './routes/stores';

export const app = new Hono().basePath('/api');

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute)
  .route('/shopping-lists', shoppingListsRoute)
  .route('/pantry', pantryRoute);

// Application 層のエラー基底 2 種だけで HTTP へ変換する。具象エラーを列挙しないため、
// 新しいエラークラスを追加してもここへの追従は不要（基底を継承させることが条件）。
app.onError((err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidOperationError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof routes;
