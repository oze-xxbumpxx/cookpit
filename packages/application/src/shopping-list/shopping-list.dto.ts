import type { Unit } from '@cookpit/domain/src/shared/unit';

export type ShoppingListStatus = 'active' | 'completed';
export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';

export interface ShoppingItemDto {
  id: string;
  productId: string | null;
  displayName: string;
  requiredAmount: { value: number; unit: Unit } | null;
  amountNote: string | null;
  targetStoreId: string | null;
  status: ItemStatus;
  actualPrice: { amount: number; currency: string } | null;
  actualStoreId: string | null;
  source: ItemSource;
}

export interface ShoppingListDto {
  id: string;
  mealPlanId: string;
  shoppingDate: string;
  status: ShoppingListStatus;
  items: ShoppingItemDto[];
  createdAt: string;
}

export interface GenerateShoppingListInputDto {
  mealPlanId: string;
}

export interface GenerateShoppingListResultDto {
  shoppingList: ShoppingListDto;
  created: boolean;
}

export interface AddItemInputDto {
  shoppingListId: string;
  displayName: string;
  requiredAmount: { value: number; unit: Unit };
  productId?: string | null;
  targetStoreId?: string | null;
}

export interface MarkAsBoughtInputDto {
  shoppingListId: string;
  itemId: string;
  actualPrice: { amount: number; currency: string };
  actualStoreId: string;
}

export interface ReassignStoreInputDto {
  shoppingListId: string;
  itemId: string;
  targetStoreId: string;
}

export interface GetShoppingListInputDto {
  shoppingListId: string;
}
