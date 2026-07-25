import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CompleteShoppingUseCase,
  ReopenShoppingListUseCase,
  SyncShoppingListFromMealPlanUseCase,
  InvalidShoppingListStateError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import {
  SHOPPING_LIST_ID,
  completedShoppingListDto,
  shoppingListDto,
} from './shopping-lists-test-fixtures';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    CompleteShoppingUseCase: vi.fn(),
    ReopenShoppingListUseCase: vi.fn(),
    SyncShoppingListFromMealPlanUseCase: vi.fn(),
  };
});

describe('shoppingListsRoute（完了・再開・同期）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists/:id/complete は 200 で ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(completedShoppingListDto);
    vi.mocked(CompleteShoppingUseCase).mockImplementation(
      () => ({ execute }) as unknown as CompleteShoppingUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/complete`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(completedShoppingListDto);
    expect(execute).toHaveBeenCalledWith({ shoppingListId: SHOPPING_LIST_ID });
  });

  it('POST /api/shopping-lists/:id/complete は不正な id で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CompleteShoppingUseCase).mockImplementation(
      () => ({ execute }) as unknown as CompleteShoppingUseCase,
    );

    const res = await app.request('/api/shopping-lists/not-a-uuid/complete', {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists/:id/complete は ShoppingListNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new ShoppingListNotFoundError(SHOPPING_LIST_ID));
    vi.mocked(CompleteShoppingUseCase).mockImplementation(
      () => ({ execute }) as unknown as CompleteShoppingUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/complete`, {
      method: 'POST',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: `ShoppingList not found: ${SHOPPING_LIST_ID}`,
    });
  });

  it('POST /api/shopping-lists/:id/complete は 2 回連続でも同じ形を 200 で返す', async () => {
    const execute = vi.fn().mockResolvedValue(completedShoppingListDto);
    vi.mocked(CompleteShoppingUseCase).mockImplementation(
      () => ({ execute }) as unknown as CompleteShoppingUseCase,
    );

    const first = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/complete`, {
      method: 'POST',
    });
    const second = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/complete`, {
      method: 'POST',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(completedShoppingListDto);
    expect(await second.json()).toEqual(completedShoppingListDto);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, { shoppingListId: SHOPPING_LIST_ID });
    expect(execute).toHaveBeenNthCalledWith(2, { shoppingListId: SHOPPING_LIST_ID });
  });

  it('POST /api/shopping-lists/:id/reopen は 200 で active の ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingListDto);
    vi.mocked(ReopenShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as ReopenShoppingListUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/reopen`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingListDto);
    expect(execute).toHaveBeenCalledWith({ shoppingListId: SHOPPING_LIST_ID });
  });

  it('POST /api/shopping-lists/:id/reopen は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('active', 'reopen'));
    vi.mocked(ReopenShoppingListUseCase).mockImplementation(
      () => ({ execute }) as unknown as ReopenShoppingListUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/reopen`, {
      method: 'POST',
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot reopen a ShoppingList with status 'active'",
    });
  });

  it('POST /api/shopping-lists/:id/sync は 200 で更新後 ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingListDto);
    vi.mocked(SyncShoppingListFromMealPlanUseCase).mockImplementation(
      () => ({ execute }) as unknown as SyncShoppingListFromMealPlanUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingListDto);
    expect(execute).toHaveBeenCalledWith({ shoppingListId: SHOPPING_LIST_ID });
  });

  it('POST /api/shopping-lists/:id/sync は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('completed', 'sync'));
    vi.mocked(SyncShoppingListFromMealPlanUseCase).mockImplementation(
      () => ({ execute }) as unknown as SyncShoppingListFromMealPlanUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(422);
  });
});
