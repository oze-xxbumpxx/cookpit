import type {
  PriceRecordDto,
  ProductDto,
  ShoppingItemDto,
  ShoppingListDto,
  StoreDto,
} from '@cookpit/application';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** 買い物リスト画面のテストが共有する DTO ファクトリと操作ヘルパ。 */

export function createStoreDto(overrides: Partial<StoreDto> = {}): StoreDto {
  return {
    id: 'store-a',
    name: '店舗A',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createShoppingItemDto(overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id: 'item-1',
    productId: null,
    displayName: '醤油',
    requiredAmount: { value: 1, unit: '本' },
    amountNote: null,
    targetStoreId: 'store-a',
    status: 'pending',
    actualPrice: null,
    actualStoreId: null,
    source: 'from_meal_plan',
    pantryDeductedAmount: null,
    ...overrides,
  };
}

export function createShoppingListDto(overrides: Partial<ShoppingListDto> = {}): ShoppingListDto {
  return {
    id: 'shopping-list-1',
    mealPlanId: 'meal-plan-1',
    shoppingDate: '2026-07-11',
    status: 'active',
    items: [],
    coveredIngredients: null,
    createdAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

export const STORE_A = createStoreDto({ id: 'store-a', name: '店舗A' });
export const STORE_B = createStoreDto({ id: 'store-b', name: '店舗B' });
export const STORES = [STORE_A, STORE_B];

export function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 198,
    unitPriceAmount: 99,
    packageSizeValue: 200,
    packageSizeUnit: 'g',
    observedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-a',
    name: '醤油',
    aliases: [],
    category: '調味料',
    defaultUnit: '本',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export const PRODUCTS: ProductDto[] = [];

export async function fillPurchaseInputForm(itemDisplayName: string, price: string): Promise<void> {
  const user = userEvent.setup();
  const row = screen.getByRole('checkbox', { name: new RegExp(itemDisplayName) }).closest('li');
  if (row === null) {
    throw new Error('row not found');
  }
  await user.type(within(row as HTMLElement).getByLabelText('価格'), price);
}
