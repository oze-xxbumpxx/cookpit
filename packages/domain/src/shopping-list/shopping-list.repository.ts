import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { StoreId } from '../shared/store';
import type { ShoppingList } from './shopping-list';
import type { ShoppingListId } from './shopping-list-id';

export interface ShoppingListRepository {
  findById(id: ShoppingListId): Promise<ShoppingList | null>;
  /** MealPlan と ShoppingList は 1:1。Generate の冪等判定（S-6）が前提とする契約。 */
  findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>;
  /** 新規保存と更新の両方を担う（upsert）。 */
  save(shoppingList: ShoppingList): Promise<void>;
  /**
   * 指定した店舗を購入予定店舗（targetStore）または実購入店舗（actualStore）として参照する
   * 品目の件数を返す（全リストの合計）。同じ品目が両方で参照していても 1 件と数える。
   * 店舗削除の可否判定（ADR-0012）のためだけに使う。
   */
  countItemsByStore(storeId: StoreId): Promise<number>;
}
