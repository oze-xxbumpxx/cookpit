import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { ShoppingList } from './shopping-list';
import type { ShoppingListId } from './shopping-list-id';

export interface ShoppingListRepository {
  findById(id: ShoppingListId): Promise<ShoppingList | null>;
  /** MealPlan と ShoppingList は 1:1。Generate の冪等判定（S-6）が前提とする契約。 */
  findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>;
  /** 新規保存と更新の両方を担う（upsert）。 */
  save(shoppingList: ShoppingList): Promise<void>;
}
