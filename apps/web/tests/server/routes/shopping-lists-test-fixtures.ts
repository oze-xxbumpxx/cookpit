import type { ShoppingItemDto, ShoppingListDto } from '@cookpit/application';

/** 買い物リストのルートテストが共有する ID と DTO。 */

export const MEAL_PLAN_ID = '4a88f79a-6ef6-46d3-931f-eae7cf283ae8';
export const SHOPPING_LIST_ID = '282cc747-84c5-4d19-9f91-9c28dcce8a57';
export const SHOPPING_ITEM_ID = 'bddc9ee7-b38f-4718-8dff-8df67145784f';
export const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';
export const STORE_ID = '2539ec78-a1b3-49ec-8d4b-32a725a43ee7';
export const shoppingItemDto: ShoppingItemDto = {
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

export const shoppingListDto: ShoppingListDto = {
  id: SHOPPING_LIST_ID,
  mealPlanId: MEAL_PLAN_ID,
  shoppingDate: '2026-07-11',
  status: 'active',
  items: [shoppingItemDto],
  createdAt: '2026-07-11T00:00:00.000Z',
};

export const completedShoppingListDto: ShoppingListDto = {
  ...shoppingListDto,
  status: 'completed',
};

export const addItemBody = {
  displayName: '醤油',
  requiredAmount: { value: 1, unit: '本' },
  productId: null,
  targetStoreId: null,
};

export const markAsBoughtBody = {
  actualPrice: { amount: 198, currency: 'JPY' },
  actualStoreId: STORE_ID,
};

export const setItemCheckedBody = { checked: true };

export const reassignStoreBody = { targetStoreId: STORE_ID };
