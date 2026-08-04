import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  MarkAsBoughtUseCase,
  InvalidShoppingListStateError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type { ShoppingItemDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import {
  SHOPPING_ITEM_ID,
  SHOPPING_LIST_ID,
  STORE_ID,
  markAsBoughtBody,
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
describe('shoppingListsRoute（購入確定）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists/:id/items/:itemId/bought は 200 で ShoppingItemDto を返す', async () => {
    const boughtItem: ShoppingItemDto = {
      ...shoppingItemDto,
      status: 'bought',
      actualPrice: markAsBoughtBody.actualPrice,
      actualStoreId: STORE_ID,
    };
    const execute = vi.fn().mockResolvedValue(boughtItem);
    vi.mocked(MarkAsBoughtUseCase).mockImplementation(function () {
      return { execute } as unknown as MarkAsBoughtUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/bought`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markAsBoughtBody),
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(boughtItem);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      itemId: SHOPPING_ITEM_ID,
      ...markAsBoughtBody,
    });
  });

  it.each([
    ['不正な id', 'not-a-uuid', SHOPPING_ITEM_ID, markAsBoughtBody],
    ['不正な itemId', SHOPPING_LIST_ID, 'not-a-uuid', markAsBoughtBody],
    [
      '不正な currency',
      SHOPPING_LIST_ID,
      SHOPPING_ITEM_ID,
      { ...markAsBoughtBody, actualPrice: { amount: 198, currency: 'USD' } },
    ],
    [
      '負の actualPrice.amount',
      SHOPPING_LIST_ID,
      SHOPPING_ITEM_ID,
      { ...markAsBoughtBody, actualPrice: { amount: -1, currency: 'JPY' } },
    ],
    [
      '不正な actualStoreId',
      SHOPPING_LIST_ID,
      SHOPPING_ITEM_ID,
      { ...markAsBoughtBody, actualStoreId: 'not-a-uuid' },
    ],
  ])(
    'POST /api/shopping-lists/:id/items/:itemId/bought は%sで 400 を返す',
    async (_case, id, itemId, body) => {
      const execute = vi.fn();
      vi.mocked(MarkAsBoughtUseCase).mockImplementation(function () {
        return { execute } as unknown as MarkAsBoughtUseCase;
      });

      const res = await app.request(`/api/shopping-lists/${id}/items/${itemId}/bought`, {
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
    'POST /api/shopping-lists/:id/items/:itemId/bought は%sを 404 に変換する',
    async (_case, error, message) => {
      const execute = vi.fn().mockRejectedValue(error);
      vi.mocked(MarkAsBoughtUseCase).mockImplementation(function () {
        return { execute } as unknown as MarkAsBoughtUseCase;
      });

      const res = await app.request(
        `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/bought`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markAsBoughtBody),
        },
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: message });
    },
  );

  it('POST /api/shopping-lists/:id/items/:itemId/bought は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('completed', 'markAsBought'));
    vi.mocked(MarkAsBoughtUseCase).mockImplementation(function () {
      return { execute } as unknown as MarkAsBoughtUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/bought`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markAsBoughtBody),
      },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot markAsBought a ShoppingList with status 'completed'",
    });
  });
});
