import type { Unit } from '@cookpit/domain';
import type { StorageLocation } from '../pantry/pantry.dto';

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

export interface RemoveItemInputDto {
  shoppingListId: string;
  itemId: string;
}

export interface GetShoppingListInputDto {
  shoppingListId: string;
}

/**
 * 買い物完了時に在庫へ追加する 1 品目の指定。`itemId` はそのリストの bought 品目でなければならない。
 * `amount` は画面で修正できるため、買い物リスト側の数量とは一致しないことがある。
 */
export interface StockAdditionInputDto {
  itemId: string;
  amount: { value: number; unit: Unit };
  storedLocation: StorageLocation | null;
  /** "2026-07-25" 形式のローカル日付（ISO datetime ではない。S-10 と同じ扱い）。 */
  expiresAt: string | null;
}

export interface CompleteShoppingInputDto {
  shoppingListId: string;
  /** 在庫へ追加しない場合も空配列を明示的に渡す。 */
  stockAdditions: StockAdditionInputDto[];
}

export interface ReopenShoppingListInputDto {
  shoppingListId: string;
}

export interface SyncShoppingListInputDto {
  shoppingListId: string;
}
