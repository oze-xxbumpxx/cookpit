/**
 * `@cookpit/domain` の公開境界（ADR-0010）。
 *
 * 消費側は必ずこのバレル経由で import する（`@cookpit/domain/src/...` は使わない）。
 * パッケージ内部の相互参照は相対パスのままとし、循環参照を避けるためバレルを
 * 自己参照しない。新しい集約・値オブジェクトを追加したら、同じコミットでここにも追加する。
 */

// 共有（値オブジェクト・共通基底）
export * from './shared/identifier';
export * from './shared/money';
export * from './shared/quantity';
export * from './shared/seasoning';
export * from './shared/store';
export * from './shared/store.repository';
export * from './shared/unit';
export * from './shared/week-identifier';

// Recipe 集約
export * from './recipe/cooking-step';
export * from './recipe/recipe';
export * from './recipe/recipe-id';
export * from './recipe/recipe-ingredient';
export * from './recipe/recipe.repository';

// Product 集約
export * from './product/price-record-id';
export * from './product/product';
export * from './product/product-id';
export * from './product/product.repository';
export * from './product/unit-price-calculator';

// MealPlan 集約
export * from './meal-plan/meal-plan';
export * from './meal-plan/meal-plan-id';
export * from './meal-plan/meal-plan.repository';
export * from './meal-plan/planned-recipe-id';

// ShoppingList 集約
export * from './shopping-list/shopping-item-id';
export * from './shopping-list/shopping-list';
export * from './shopping-list/shopping-list-id';
export * from './shopping-list/shopping-list.repository';

// Pantry 集約
export * from './pantry/pantry';
export * from './pantry/pantry-id';
export * from './pantry/pantry.repository';
export * from './pantry/stock-id';

// PushSubscription 集約
export * from './push-subscription/push-subscription';
export * from './push-subscription/push-subscription-id';
export * from './push-subscription/push-subscription.repository';
export * from './push-subscription/push-sender';
