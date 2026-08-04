import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  InvalidShoppingListStateError,
  RemoveItemUseCase,
  SetItemCheckedUseCase,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import {
  SHOPPING_ITEM_ID,
  SHOPPING_LIST_ID,
  setItemCheckedBody,
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
    RemoveItemUseCase: vi.fn(),
    SetItemCheckedUseCase: vi.fn(),
  };
});

const REMOVE_PATH = `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}`;

function mockRemoveItem(execute: ReturnType<typeof vi.fn>): void {
  vi.mocked(RemoveItemUseCase).mockImplementation(
    () => ({ execute }) as unknown as RemoveItemUseCase,
  );
}

describe('shoppingListsRoute（品目削除）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DELETE /api/shopping-lists/:id/items/:itemId は 204 を返しボディを持たない', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    mockRemoveItem(execute);

    const res = await app.request(REMOVE_PATH, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      itemId: SHOPPING_ITEM_ID,
    });
  });

  it.each([
    ['不正な id', 'not-a-uuid', SHOPPING_ITEM_ID],
    ['不正な itemId', SHOPPING_LIST_ID, 'not-a-uuid'],
  ])(
    'DELETE /api/shopping-lists/:id/items/:itemId は%sで 400 を返す',
    async (_case, id, itemId) => {
      const execute = vi.fn();
      mockRemoveItem(execute);

      const res = await app.request(`/api/shopping-lists/${id}/items/${itemId}`, {
        method: 'DELETE',
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
    'DELETE /api/shopping-lists/:id/items/:itemId は%sを 404 に変換する',
    async (_case, error, message) => {
      mockRemoveItem(vi.fn().mockRejectedValue(error));

      const res = await app.request(REMOVE_PATH, { method: 'DELETE' });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: message });
    },
  );

  it('DELETE /api/shopping-lists/:id/items/:itemId は InvalidShoppingListStateError を 422 に変換する', async () => {
    mockRemoveItem(
      vi.fn().mockRejectedValue(new InvalidShoppingListStateError('completed', 'removeItem')),
    );

    const res = await app.request(REMOVE_PATH, { method: 'DELETE' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot removeItem a ShoppingList with status 'completed'",
    });
  });

  // DELETE の追加で、同じパス形の既存 POST ルートが食い合わないことを固定する。
  it('DELETE の追加後も POST /items/:itemId/checked は解決する', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingItemDto);
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

    const res = await app.request(`${REMOVE_PATH}/checked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setItemCheckedBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(shoppingItemDto);
  });
});
