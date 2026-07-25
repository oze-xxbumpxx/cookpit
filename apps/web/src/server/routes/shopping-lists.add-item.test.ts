import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  AddItemUseCase,
  InvalidShoppingListStateError,
  ShoppingListNotFoundError,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import { SHOPPING_LIST_ID, addItemBody, shoppingItemDto } from './shopping-lists-test-fixtures';

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
describe('shoppingListsRoute（品目追加）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/shopping-lists/:id/items は 201 で ShoppingItemDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingItemDto);
    vi.mocked(AddItemUseCase).mockImplementation(() => ({ execute }) as unknown as AddItemUseCase);

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addItemBody),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(shoppingItemDto);
    expect(execute).toHaveBeenCalledWith({
      shoppingListId: SHOPPING_LIST_ID,
      ...addItemBody,
    });
  });

  it.each([
    ['不正な id', 'not-a-uuid', addItemBody],
    ['空の displayName', SHOPPING_LIST_ID, { ...addItemBody, displayName: '  ' }],
    [
      '負の requiredAmount.value',
      SHOPPING_LIST_ID,
      { ...addItemBody, requiredAmount: { value: -1, unit: '本' } },
    ],
    [
      '空の requiredAmount.unit',
      SHOPPING_LIST_ID,
      { ...addItemBody, requiredAmount: { value: 1, unit: '' } },
    ],
    [
      'productId の欠落',
      SHOPPING_LIST_ID,
      {
        displayName: addItemBody.displayName,
        requiredAmount: addItemBody.requiredAmount,
        targetStoreId: addItemBody.targetStoreId,
      },
    ],
    [
      'targetStoreId の欠落',
      SHOPPING_LIST_ID,
      {
        displayName: addItemBody.displayName,
        requiredAmount: addItemBody.requiredAmount,
        productId: addItemBody.productId,
      },
    ],
  ])('POST /api/shopping-lists/:id/items は%sで 400 を返す', async (_case, id, body) => {
    const execute = vi.fn();
    vi.mocked(AddItemUseCase).mockImplementation(() => ({ execute }) as unknown as AddItemUseCase);

    const res = await app.request(`/api/shopping-lists/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/shopping-lists/:id/items は ShoppingListNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new ShoppingListNotFoundError(SHOPPING_LIST_ID));
    vi.mocked(AddItemUseCase).mockImplementation(() => ({ execute }) as unknown as AddItemUseCase);

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addItemBody),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: `ShoppingList not found: ${SHOPPING_LIST_ID}`,
    });
  });

  it('POST /api/shopping-lists/:id/items は InvalidShoppingListStateError を 422 に変換する', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidShoppingListStateError('completed', 'addItem'));
    vi.mocked(AddItemUseCase).mockImplementation(() => ({ execute }) as unknown as AddItemUseCase);

    const res = await app.request(`/api/shopping-lists/${SHOPPING_LIST_ID}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addItemBody),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Cannot addItem a ShoppingList with status 'completed'",
    });
  });
});
