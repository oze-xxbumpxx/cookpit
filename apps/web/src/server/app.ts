import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { storesRoute } from './routes/stores';
import { RecipeNotFoundError, StoreNotFoundError } from '@cookpit/application';
const app = new Hono().basePath('/api');

const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/stores', storesRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
