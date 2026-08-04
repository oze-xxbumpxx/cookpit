import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  ReassignStoreUseCase,
  InvalidShoppingListStateError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import {
  SHOPPING_ITEM_ID,
  SHOPPING_LIST_ID,
  reassignStoreBody,
  shoppingItemDto,
} from './shopping-lists-test-fixtures';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    AddItemUseCase: vi.fn(),
    MarkAsBoughtUseCase: vi.fn(),
    ReassignStoreUseCase: vi.fn(),
    SetItemCheckedUseCase: vi.fn(),
  };
});
describe('shoppingListsRoute（店舗再割当）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists/:id/items/:itemId/target-store は 200 で ShoppingItemDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingItemDto);
    vi.mocked(ReassignStoreUseCase).mockImplementation(function () {
      return { execute } as unknown as ReassignStoreUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/target-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reassignStoreBody),
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingItemDto);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      itemId: SHOPPING_ITEM_ID,
      ...reassignStoreBody,
    });
  });

  it.each([
    ['不正な id', 'not-a-uuid', SHOPPING_ITEM_ID, reassignStoreBody],
    ['不正な itemId', SHOPPING_LIST_ID, 'not-a-uuid', reassignStoreBody],
    ['不正な targetStoreId', SHOPPING_LIST_ID, SHOPPING_ITEM_ID, { targetStoreId: 'not-a-uuid' }],
  ])(
    'POST /api/shopping-lists/:id/items/:itemId/target-store は%sで 400 を返す',
    async (_case, id, itemId, body) => {
      const execute = vi.fn();
      vi.mocked(ReassignStoreUseCase).mockImplementation(function () {
        return { execute } as unknown as ReassignStoreUseCase;
      });

      const res = await app.request(`/api/shopping-lists/${id}/items/${itemId}/target-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'ShoppingListNotFoundError',
      new ShoppingListNotFoundError(SHOPPING_LIST_ID),
      `ShoppingList not found: ${SHOPPING_LIST_ID}`,
    ],
    [
      'ShoppingItemNotFoundError',
      new ShoppingItemNotFoundError(SHOPPING_ITEM_ID),
      `ShoppingItem not found: ${SHOPPING_ITEM_ID}`,
    ],
  ])(
    'POST /api/shopping-lists/:id/items/:itemId/target-store は%sを 404 に変換する',
    async (_case, error, message) => {
      const execute = vi.fn().mockRejectedValue(error);
      vi.mocked(ReassignStoreUseCase).mockImplementation(function () {
        return { execute } as unknown as ReassignStoreUseCase;
      });

      const res = await app.request(
        `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/target-store`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reassignStoreBody),
        },
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: message });
    },
  );

  it('POST /api/shopping-lists/:id/items/:itemId/target-store は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('completed', 'reassignStore'));
    vi.mocked(ReassignStoreUseCase).mockImplementation(function () {
      return { execute } as unknown as ReassignStoreUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/target-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reassignStoreBody),
      },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot reassignStore a ShoppingList with status 'completed'",
    });
  });
});
