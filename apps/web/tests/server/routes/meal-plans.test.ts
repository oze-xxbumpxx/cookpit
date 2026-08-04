import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  AddRecipeToMealPlanUseCase,
  CreateMealPlanUseCase,
  GetCurrentMealPlanUseCase,
  GetMealPlanHistoryUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  GetRecipeUseCase,
  GetRecipesUseCase,
  GetStoresUseCase,
  InvalidMealPlanStateError,
  MealPlanNotFoundError,
  PlannedRecipeNotFoundError,
  ProductNotFoundError,
  RecordPriceUseCase,
  RecipeNotFoundError,
  RemoveRecipeFromMealPlanUseCase,
  StoreNotFoundError,
} from '@cookpit/application';
import type {
  MealPlanDto,
  PlannedRecipeDto,
  ProductDto,
  RecipeDto,
  StoreDto,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    AddRecipeToMealPlanUseCase: vi.fn(),
    CreateMealPlanUseCase: vi.fn(),
    GetCurrentMealPlanUseCase: vi.fn(),
    GetMealPlanHistoryUseCase: vi.fn(),
    RemoveRecipeFromMealPlanUseCase: vi.fn(),
    GetRecipesUseCase: vi.fn(),
    GetRecipeUseCase: vi.fn(),
    GetProductsUseCase: vi.fn(),
    GetProductUseCase: vi.fn(),
    GetStoresUseCase: vi.fn(),
    RecordPriceUseCase: vi.fn(),
  };
});

const MEAL_PLAN_ID = '4a88f79a-6ef6-46d3-931f-eae7cf283ae8';
const PLANNED_RECIPE_ID = '959f4401-ef0f-4d1f-bc22-0912bce1147f';
const RECIPE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';
const STORE_ID = '2539ec78-a1b3-49ec-8d4b-32a725a43ee7';

const plannedRecipeDto: PlannedRecipeDto = {
  id: PLANNED_RECIPE_ID,
  recipeId: RECIPE_ID,
  scaleFactor: 1.5,
  scheduledDate: null,
  cookedAt: null,
  notes: '',
};

const mealPlanDto: MealPlanDto = {
  id: MEAL_PLAN_ID,
  weekIdentifier: '2026-07-04',
  status: 'draft',
  plannedRecipes: [plannedRecipeDto],
  createdAt: '2026-07-04T00:00:00.000Z',
  completedAt: null,
};

const recipeDto: RecipeDto = {
  id: RECIPE_ID,
  name: '肉じゃが',
  baseServings: 4,
  servings: null,
  cookingTime: 30,
  tags: ['主菜'],
  notes: '',
  ingredients: [],
  steps: [{ description: '材料を煮る' }],
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
};

const productDto: ProductDto = {
  id: PRODUCT_ID,
  name: 'トマト',
  aliases: [],
  category: '野菜',
  defaultUnit: '個',
  priceHistory: [],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const storeDto: StoreDto = {
  id: STORE_ID,
  name: 'スーパーA',
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('mealPlansRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/meal-plans は 201 で MealPlanDto を返す', async () => {
    const body = { weekIdentifier: '2026-07-04' };
    const execute = vi.fn().mockResolvedValue(mealPlanDto);
    vi.mocked(CreateMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as CreateMealPlanUseCase;
    });

    const res = await app.request('/api/meal-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(mealPlanDto);
    expect(execute).toHaveBeenCalledWith(body);
  });

  it('POST /api/meal-plans は不正な weekIdentifier で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CreateMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as CreateMealPlanUseCase;
    });

    const res = await app.request('/api/meal-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekIdentifier: '2026/07/04' }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('GET /api/meal-plans/current は MealPlanDto を data に包んで返す', async () => {
    const execute = vi.fn().mockResolvedValue(mealPlanDto);
    vi.mocked(GetCurrentMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as GetCurrentMealPlanUseCase;
    });

    const res = await app.request('/api/meal-plans/current');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: mealPlanDto });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('GET /api/meal-plans/current は MealPlan がない場合も 200 + data:null を返す', async () => {
    const execute = vi.fn().mockResolvedValue(null);
    vi.mocked(GetCurrentMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as GetCurrentMealPlanUseCase;
    });

    const res = await app.request('/api/meal-plans/current');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('GET /api/meal-plans/history は limit を UseCase に渡して MealPlanDto 配列を返す', async () => {
    const execute = vi.fn().mockResolvedValue([mealPlanDto]);
    vi.mocked(GetMealPlanHistoryUseCase).mockImplementation(function () {
      return { execute } as unknown as GetMealPlanHistoryUseCase;
    });

    const res = await app.request('/api/meal-plans/history?limit=4');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([mealPlanDto]);
    expect(execute).toHaveBeenCalledWith({ limit: 4 });
  });

  it('GET /api/meal-plans/history は limit が最大値を超えると 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(GetMealPlanHistoryUseCase).mockImplementation(function () {
      return { execute } as unknown as GetMealPlanHistoryUseCase;
    });

    const res = await app.request('/api/meal-plans/history?limit=13');

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/meal-plans/:id/recipes は 201 で PlannedRecipeDto を返す', async () => {
    const body = { recipeId: RECIPE_ID, scaleFactor: 1.5 };
    const execute = vi.fn().mockResolvedValue(plannedRecipeDto);
    vi.mocked(AddRecipeToMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as AddRecipeToMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(plannedRecipeDto);
    expect(execute).toHaveBeenCalledWith({ mealPlanId: MEAL_PLAN_ID, ...body });
  });

  it('POST /api/meal-plans/:id/recipes は不正な MealPlan ID で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(AddRecipeToMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as AddRecipeToMealPlanUseCase;
    });

    const res = await app.request('/api/meal-plans/not-a-uuid/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: RECIPE_ID, scaleFactor: 1 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([0, -1])(
    'POST /api/meal-plans/:id/recipes は scaleFactor:%s で 400 を返す',
    async (scaleFactor) => {
      const execute = vi.fn();
      vi.mocked(AddRecipeToMealPlanUseCase).mockImplementation(function () {
        return { execute } as unknown as AddRecipeToMealPlanUseCase;
      });

      const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: RECIPE_ID, scaleFactor }),
      });

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('POST /api/meal-plans/:id/recipes は MealPlanNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new MealPlanNotFoundError(MEAL_PLAN_ID));
    vi.mocked(AddRecipeToMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as AddRecipeToMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: RECIPE_ID, scaleFactor: 1 }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `MealPlan not found: ${MEAL_PLAN_ID}` });
  });

  it('POST /api/meal-plans/:id/recipes は InvalidMealPlanStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidMealPlanStateError('cooking', 'addRecipe'));
    vi.mocked(AddRecipeToMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as AddRecipeToMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: RECIPE_ID, scaleFactor: 1 }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot addRecipe a MealPlan with status 'cooking'",
    });
  });

  it('DELETE /api/meal-plans/:id/recipes/:plannedRecipeId は 204 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(RemoveRecipeFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as RemoveRecipeFromMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes/${PLANNED_RECIPE_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(execute).toHaveBeenCalledWith({
      mealPlanId: MEAL_PLAN_ID,
      plannedRecipeId: PLANNED_RECIPE_ID,
    });
  });

  it('DELETE /api/meal-plans/:id/recipes/:plannedRecipeId は MealPlanNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new MealPlanNotFoundError(MEAL_PLAN_ID));
    vi.mocked(RemoveRecipeFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as RemoveRecipeFromMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes/${PLANNED_RECIPE_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `MealPlan not found: ${MEAL_PLAN_ID}` });
  });

  it('DELETE /api/meal-plans/:id/recipes/:plannedRecipeId は PlannedRecipeNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new PlannedRecipeNotFoundError(PLANNED_RECIPE_ID));
    vi.mocked(RemoveRecipeFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as RemoveRecipeFromMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes/${PLANNED_RECIPE_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: `PlannedRecipe not found: ${PLANNED_RECIPE_ID}`,
    });
  });

  it('DELETE /api/meal-plans/:id/recipes/:plannedRecipeId は InvalidMealPlanStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidMealPlanStateError('cooking', 'removeRecipe'));
    vi.mocked(RemoveRecipeFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as RemoveRecipeFromMealPlanUseCase;
    });

    const res = await app.request(`/api/meal-plans/${MEAL_PLAN_ID}/recipes/${PLANNED_RECIPE_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot removeRecipe a MealPlan with status 'cooking'",
    });
  });

  it('mealPlansRoute マウント後も既存の health/recipes/products/stores レスポンスが変わらない', async () => {
    vi.mocked(GetRecipesUseCase).mockImplementation(function () {
      return { execute: vi.fn().mockResolvedValue([recipeDto]) } as unknown as GetRecipesUseCase;
    });
    vi.mocked(GetProductsUseCase).mockImplementation(function () {
      return { execute: vi.fn().mockResolvedValue([productDto]) } as unknown as GetProductsUseCase;
    });
    vi.mocked(GetStoresUseCase).mockImplementation(function () {
      return { execute: vi.fn().mockResolvedValue([storeDto]) } as unknown as GetStoresUseCase;
    });

    const healthRes = await app.request('/api/health');
    const recipesRes = await app.request('/api/recipes');
    const productsRes = await app.request('/api/products');
    const storesRes = await app.request('/api/stores');

    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toMatchObject({
      status: 'ok',
      db: 'disconnected (no DATABASE_URL)',
    });
    expect(recipesRes.status).toBe(200);
    expect(await recipesRes.json()).toEqual([recipeDto]);
    expect(productsRes.status).toBe(200);
    expect(await productsRes.json()).toEqual([productDto]);
    expect(storesRes.status).toBe(200);
    expect(await storesRes.json()).toEqual([storeDto]);
  });

  it('既存の Recipe/Product/Store の 404 エラー分岐を維持する', async () => {
    vi.mocked(GetRecipeUseCase).mockImplementation(function () {
      return {
        execute: vi.fn().mockRejectedValue(new RecipeNotFoundError(RECIPE_ID)),
      } as unknown as GetRecipeUseCase;
    });
    vi.mocked(GetProductUseCase).mockImplementation(function () {
      return {
        execute: vi.fn().mockRejectedValue(new ProductNotFoundError(PRODUCT_ID)),
      } as unknown as GetProductUseCase;
    });
    vi.mocked(RecordPriceUseCase).mockImplementation(function () {
      return {
        execute: vi.fn().mockRejectedValue(new StoreNotFoundError(STORE_ID)),
      } as unknown as RecordPriceUseCase;
    });

    const recipeRes = await app.request(`/api/recipes/${RECIPE_ID}`);
    const productRes = await app.request(`/api/products/${PRODUCT_ID}`);
    const storeRes = await app.request(`/api/products/${PRODUCT_ID}/price-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: STORE_ID,
        priceAmount: 100,
        packageSizeValue: 1,
        packageSizeUnit: '個',
      }),
    });

    expect(recipeRes.status).toBe(404);
    expect(await recipeRes.json()).toEqual({ error: `Recipe not found: ${RECIPE_ID}` });
    expect(productRes.status).toBe(404);
    expect(await productRes.json()).toEqual({ error: `Product not found: ${PRODUCT_ID}` });
    expect(storeRes.status).toBe(404);
    expect(await storeRes.json()).toEqual({ error: `Store not found: ${STORE_ID}` });
  });
});
