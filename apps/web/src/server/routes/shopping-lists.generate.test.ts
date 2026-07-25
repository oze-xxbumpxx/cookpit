import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  InvalidMealPlanStateError,
  MealPlanNotFoundError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import { MEAL_PLAN_ID, SHOPPING_LIST_ID, shoppingListDto } from './shopping-lists-test-fixtures';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    GenerateShoppingListUseCase: vi.fn(),
    GetShoppingListUseCase: vi.fn(),
  };
});

describe('shoppingListsRoute（生成・取得）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists は新規生成時に 201 で ShoppingListDto を返す', async () => {
    const body = { mealPlanId: MEAL_PLAN_ID };
    const execute = vi.fn().mockResolvedValue({ shoppingList: shoppingListDto, created: true });
    vi.mocked(GenerateShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GenerateShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(shoppingListDto);
    expect(execute).toHaveBeenCalledWith(body);
  });

  it('POST /api/shopping-lists は既存リスト返却時に 200 で ShoppingListDto を返す', async () => {
    const body = { mealPlanId: MEAL_PLAN_ID };
    const execute = vi.fn().mockResolvedValue({ shoppingList: shoppingListDto, created: false });
    vi.mocked(GenerateShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GenerateShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingListDto);
    expect(execute).toHaveBeenCalledWith(body);
  });

  it('POST /api/shopping-lists は不正な mealPlanId で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(GenerateShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GenerateShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealPlanId: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists は MealPlanNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new MealPlanNotFoundError(MEAL_PLAN_ID));
    vi.mocked(GenerateShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GenerateShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealPlanId: MEAL_PLAN_ID }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `MealPlan not found: ${MEAL_PLAN_ID}` });
  });

  it('POST /api/shopping-lists は InvalidMealPlanStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidMealPlanStateError('shopping', 'generate a ShoppingList from'));
    vi.mocked(GenerateShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GenerateShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealPlanId: MEAL_PLAN_ID }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot generate a ShoppingList from a MealPlan with status 'shopping'",
    });
  });

  it('GET /api/shopping-lists/:id は 200 で ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingListDto);
    vi.mocked(GetShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetShoppingListUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingListDto);
    expect(execute).toHaveBeenCalledWith({ shoppingListId: SHOPPING_LIST_ID });
  });

  it('GET /api/shopping-lists/:id は不正な id で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(GetShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetShoppingListUseCase,
    );

    const res = await app.request('/api/shopping-lists/not-a-uuid');

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('GET /api/shopping-lists/:id は ShoppingListNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new ShoppingListNotFoundError(SHOPPING_LIST_ID));
    vi.mocked(GetShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetShoppingListUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: `ShoppingList not found: ${SHOPPING_LIST_ID}`,
    });
  });
});
