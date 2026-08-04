import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CompleteShoppingUseCase,
  InvalidStockOperationError,
  ReopenShoppingListUseCase,
  ShoppingItemNotFoundError,
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

const ITEM_ID = '33333333-3333-4333-8333-333333333333';

/** 完了リクエストのボディ（`stockAdditions` は必須）。 */
function completeRequest(stockAdditions: unknown[] = []): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stockAdditions }),
  };
}

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

  it('POST /api/shopping-lists/:id/complete は stockAdditions が空でも 200 で ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(completedShoppingListDto);
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(completedShoppingListDto);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });
  });

  it('POST /api/shopping-lists/:id/complete は stockAdditions をそのまま UseCase へ渡す', async () => {
    const execute = vi.fn().mockResolvedValue(completedShoppingListDto);
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });
    const addition = {
      itemId: ITEM_ID,
      amount: { value: 500, unit: 'g' },
      storedLocation: 'fridge',
      expiresAt: '2026-08-01',
    };

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest([addition]),
    );

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [addition],
    });
  });

  it('POST /api/shopping-lists/:id/complete は不正な id で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request('/api/shopping-lists/not-a-uuid/complete', completeRequest());

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists/:id/complete はボディなしで 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/complete`, {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists/:id/complete は数量 0 の stockAdditions で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest([
        {
          itemId: ITEM_ID,
          amount: { value: 0, unit: '個' },
          storedLocation: null,
          expiresAt: null,
        },
      ]),
    );

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists/:id/complete は ShoppingListNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new ShoppingListNotFoundError(SHOPPING_LIST_ID));
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: `ShoppingList not found: ${SHOPPING_LIST_ID}`,
    });
  });

  it('POST /api/shopping-lists/:id/complete は ShoppingItemNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new ShoppingItemNotFoundError(ITEM_ID));
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );

    expect(res.status).toBe(404);
  });

  it('POST /api/shopping-lists/:id/complete は InvalidStockOperationError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidStockOperationError('ShoppingItem is not bought'));
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'ShoppingItem is not bought' });
  });

  it('POST /api/shopping-lists/:id/complete は 2 回連続でも同じ形を 200 で返す', async () => {
    const execute = vi.fn().mockResolvedValue(completedShoppingListDto);
    vi.mocked(CompleteShoppingUseCase).mockImplementation(function () {
      return { execute } as unknown as CompleteShoppingUseCase;
    });

    const first = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );
    const second = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/complete`,
      completeRequest(),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(completedShoppingListDto);
    expect(await second.json()).toEqual(completedShoppingListDto);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, {
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });
  });

  it('POST /api/shopping-lists/:id/reopen は 200 で active の ShoppingListDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingListDto);
    vi.mocked(ReopenShoppingListUseCase).mockImplementation(function () {
      return { execute } as unknown as ReopenShoppingListUseCase;
    });

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
    vi.mocked(ReopenShoppingListUseCase).mockImplementation(function () {
      return { execute } as unknown as ReopenShoppingListUseCase;
    });

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
    vi.mocked(SyncShoppingListFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as SyncShoppingListFromMealPlanUseCase;
    });

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
    vi.mocked(SyncShoppingListFromMealPlanUseCase).mockImplementation(function () {
      return { execute } as unknown as SyncShoppingListFromMealPlanUseCase;
    });

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(422);
  });
});
