import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  SetItemCheckedUseCase,
  InvalidShoppingListStateError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type { ShoppingItemDto } from '@cookpit/application';
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
    AddItemUseCase: vi.fn(),
    MarkAsBoughtUseCase: vi.fn(),
    ReassignStoreUseCase: vi.fn(),
    SetItemCheckedUseCase: vi.fn(),
  };
});
describe('shoppingListsRoute（チェック）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists/:id/items/:itemId/checked は 200 で ShoppingItemDto を返す', async () => {
    const boughtItem: ShoppingItemDto = { ...shoppingItemDto, status: 'bought' };
    const execute = vi.fn().mockResolvedValue(boughtItem);
    vi.mocked(SetItemCheckedUseCase).mockImplementation(function () {
      return { execute } as unknown as SetItemCheckedUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setItemCheckedBody),
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(boughtItem);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      itemId: SHOPPING_ITEM_ID,
      ...setItemCheckedBody,
    });
  });

  it.each([
    ['不正な id', 'not-a-uuid', SHOPPING_ITEM_ID, setItemCheckedBody],
    ['不正な itemId', SHOPPING_LIST_ID, 'not-a-uuid', setItemCheckedBody],
    ['checked が文字列', SHOPPING_LIST_ID, SHOPPING_ITEM_ID, { checked: 'true' }],
    ['checked キーの欠落', SHOPPING_LIST_ID, SHOPPING_ITEM_ID, {}],
  ])(
    'POST /api/shopping-lists/:id/items/:itemId/checked は%sで 400 を返す',
    async (_case, id, itemId, body) => {
      const execute = vi.fn();
      vi.mocked(SetItemCheckedUseCase).mockImplementation(function () {
        return { execute } as unknown as SetItemCheckedUseCase;
      });

      const res = await app.request(`/api/shopping-lists/${id}/items/${itemId}/checked`, {
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
    'POST /api/shopping-lists/:id/items/:itemId/checked は%sを 404 に変換する',
    async (_case, error, message) => {
      const execute = vi.fn().mockRejectedValue(error);
      vi.mocked(SetItemCheckedUseCase).mockImplementation(function () {
        return { execute } as unknown as SetItemCheckedUseCase;
      });

      const res = await app.request(
        `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(setItemCheckedBody),
        },
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: message });
    },
  );

  it('POST /api/shopping-lists/:id/items/:itemId/checked は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('completed', 'setItemChecked'));
    vi.mocked(SetItemCheckedUseCase).mockImplementation(function () {
      return { execute } as unknown as SetItemCheckedUseCase;
    });

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setItemCheckedBody),
      },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot setItemChecked a ShoppingList with status 'completed'",
    });
  });

  it('POST /api/shopping-lists/:id/items/:itemId/checked は同一 checked を連続送信しても 200 を返し続ける（冪等性の契約テスト）', async () => {
    const boughtItem: ShoppingItemDto = { ...shoppingItemDto, status: 'bought' };
    const execute = vi.fn().mockResolvedValue(boughtItem);
    vi.mocked(SetItemCheckedUseCase).mockImplementation(function () {
      return { execute } as unknown as SetItemCheckedUseCase;
    });

    const first = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setItemCheckedBody),
      },
    );
    const second = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setItemCheckedBody),
      },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(boughtItem);
    expect(await second.json()).toEqual(boughtItem);
  });
});
