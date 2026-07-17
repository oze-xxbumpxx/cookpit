import { getDb } from '@/db/client';
import {
  DrizzleMealPlanRepository,
  DrizzleProductRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
  DrizzleStoreRepository,
} from '@cookpit/infrastructure';

export function recipeRepository(): DrizzleRecipeRepository {
  return new DrizzleRecipeRepository(getDb());
}

export function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(getDb());
}

export function storeRepository(): DrizzleStoreRepository {
  return new DrizzleStoreRepository(getDb());
}

export function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}

export function shoppingListRepository(): DrizzleShoppingListRepository {
  return new DrizzleShoppingListRepository(getDb());
}
