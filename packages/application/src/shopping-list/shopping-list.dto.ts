import type { Unit } from '@cookpit/domain/src/shared/unit';

export type ShoppingListStatus = 'active' | 'completed';
export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';

export interface ShoppingItemDto {
  id: string;
  productId: string | null;
  displayName: string;
  /** requiredAmount と amountNote はどちらか一方のみ非 null（S-5）。 */
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
  /** "2026-07-11" 形式のローカル日付（ISO datetime ではない。S-10）。 */
  shoppingDate: string;
  status: ShoppingListStatus;
  items: ShoppingItemDto[];
  /** ISO 8601 datetime。 */
  createdAt: string;
}

export interface GenerateShoppingListInputDto {
  mealPlanId: string;
}

export interface GenerateShoppingListResultDto {
  shoppingList: ShoppingListDto;
  /** true なら新規生成（ルート層で 201）、false なら既存返却（200）。IMP-4 */
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

export interface SetItemCheckedInputDto {
  shoppingListId: string;
  itemId: string;
  checked: boolean;
}

export interface ReassignStoreInputDto {
  shoppingListId: string;
  itemId: string;
  targetStoreId: string;
}

export interface GetShoppingListInputDto {
  shoppingListId: string;
}

export interface CompleteShoppingInputDto {
  shoppingListId: string;
}

export interface ReopenShoppingListInputDto {
  shoppingListId: string;
}

export interface SyncShoppingListInputDto {
  shoppingListId: string;
}
