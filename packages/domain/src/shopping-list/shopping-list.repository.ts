import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { ShoppingList } from './shopping-list';
import type { ShoppingListId } from './shopping-list-id';

export interface ShoppingListRepository {
  findById(id: ShoppingListId): Promise<ShoppingList | null>;
  findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>;
  save(shoppingList: ShoppingList): Promise<void>;
}
