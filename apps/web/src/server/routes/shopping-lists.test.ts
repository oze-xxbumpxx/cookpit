import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/server/app';
import {
  AddItemUseCase,
  CompleteShoppingUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  InvalidMealPlanStateError,
  InvalidShoppingListStateError,
  MarkAsBoughtUseCase,
  MealPlanNotFoundError,
  ReassignStoreUseCase,
  ReopenShoppingListUseCase,
  SetItemCheckedUseCase,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
  SyncShoppingListFromMealPlanUseCase,
} from '@cookpit/application';
import type { ShoppingItemDto, ShoppingListDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    AddItemUseCase: vi.fn(),
    CompleteShoppingUseCase: vi.fn(),
    GenerateShoppingListUseCase: vi.fn(),
    GetShoppingListUseCase: vi.fn(),
    MarkAsBoughtUseCase: vi.fn(),
    ReassignStoreUseCase: vi.fn(),
    ReopenShoppingListUseCase: vi.fn(),
    SetItemCheckedUseCase: vi.fn(),
    SyncShoppingListFromMealPlanUseCase: vi.fn(),
  };
});

const MEAL_PLAN_ID = '4a88f79a-6ef6-46d3-931f-eae7cf283ae8';
const SHOPPING_LIST_ID = '282cc747-84c5-4d19-9f91-9c28dcce8a57';
const SHOPPING_ITEM_ID = 'bddc9ee7-b38f-4718-8dff-8df67145784f';
const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';
const STORE_ID = '2539ec78-a1b3-49ec-8d4b-32a725a43ee7';

const shoppingItemDto: ShoppingItemDto = {
  id: SHOPPING_ITEM_ID,
  productId: PRODUCT_ID,
  displayName: '醤油',
  requiredAmount: { value: 1, unit: '本' },
  amountNote: null,
  targetStoreId: STORE_ID,
  status: 'pending',
  actualPrice: null,
  actualStoreId: null,
  source: 'from_meal_plan',
};

const shoppingListDto: ShoppingListDto = {
  id: SHOPPING_LIST_ID,
  mealPlanId: MEAL_PLAN_ID,
  shoppingDate: '2026-07-11',
  status: 'active',
  items: [shoppingItemDto],
  createdAt: '2026-07-11T00:00:00.000Z',
};

const completedShoppingListDto: ShoppingListDto = {
  ...shoppingListDto,
  status: 'completed',
};

const addItemBody = {
  displayName: '醤油',
  requiredAmount: { value: 1, unit: '本' },
  productId: null,
  targetStoreId: null,
};

const markAsBoughtBody = {
  actualPrice: { amount: 198, currency: 'JPY' },
  actualStoreId: STORE_ID,
};

const setItemCheckedBody = { checked: true };

const reassignStoreBody = { targetStoreId: STORE_ID };

describe('shoppingListsRoute', () => {
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

  it('POST /api/shopping-lists/:id/items/:itemId/bought は 200 で ShoppingItemDto を返す', async () => {
    const boughtItem: ShoppingItemDto = {
      ...shoppingItemDto,
      status: 'bought',
      actualPrice: markAsBoughtBody.actualPrice,
      actualStoreId: STORE_ID,
    };
    const execute = vi.fn().mockResolvedValue(boughtItem);
    vi.mocked(MarkAsBoughtUseCase).mockImplementation(
      () => ({ execute }) as unknown as MarkAsBoughtUseCase,
    );

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
      vi.mocked(MarkAsBoughtUseCase).mockImplementation(
        () => ({ execute }) as unknown as MarkAsBoughtUseCase,
      );

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
      vi.mocked(MarkAsBoughtUseCase).mockImplementation(
        () => ({ execute }) as unknown as MarkAsBoughtUseCase,
      );

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
    vi.mocked(MarkAsBoughtUseCase).mockImplementation(
      () => ({ execute }) as unknown as MarkAsBoughtUseCase,
    );

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

  it('POST /api/shopping-lists/:id/items/:itemId/checked は 200 で ShoppingItemDto を返す', async () => {
    const boughtItem: ShoppingItemDto = { ...shoppingItemDto, status: 'bought' };
    const execute = vi.fn().mockResolvedValue(boughtItem);
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

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
      vi.mocked(SetItemCheckedUseCase).mockImplementation(
        () => ({ execute }) as unknown as SetItemCheckedUseCase,
      );

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
      vi.mocked(SetItemCheckedUseCase).mockImplementation(
        () => ({ execute }) as unknown as SetItemCheckedUseCase,
      );

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
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

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
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

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

  it('POST /api/shopping-lists/:id/items/:itemId/target-store は 200 で ShoppingItemDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(shoppingItemDto);
    vi.mocked(ReassignStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as ReassignStoreUseCase,
    );

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
      vi.mocked(ReassignStoreUseCase).mockImplementation(
        () => ({ execute }) as unknown as ReassignStoreUseCase,
      );

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
      vi.mocked(ReassignStoreUseCase).mockImplementation(
        () => ({ execute }) as unknown as ReassignStoreUseCase,
      );

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
    vi.mocked(ReassignStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as ReassignStoreUseCase,
    );

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
