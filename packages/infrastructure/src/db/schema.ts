import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseServings: integer('base_servings').notNull(),
  cookingTime: integer('cooking_time'),
  tags: text('tags').array().notNull().default([]),
  notes: text('notes').notNull().default(''),
  ingredients: jsonb('ingredients').notNull().default([]),
  steps: jsonb('steps').notNull().default([]),
  servings: integer('servings'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type RecipeRow = typeof recipes.$inferSelect;

export type NewRecipeRow = typeof recipes.$inferInsert;

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default([]),
  category: text('category').notNull(),
  defaultUnit: text('default_unit').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;

export const priceRecords = pgTable(
  'price_records',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    priceAmount: numeric('price_amount', { precision: 10, scale: 1 }).notNull(),
    unitPriceAmount: numeric('unit_price_amount', { precision: 10, scale: 1 }).notNull(),
    packageSizeValue: numeric('package_size_value', { precision: 10, scale: 3 }).notNull(),
    packageSizeUnit: text('package_size_unit').notNull(),
    observedAt: timestamp('observed_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('price_records_product_id_idx').on(table.productId)],
);

export type PriceRecordRow = typeof priceRecords.$inferSelect;
export type NewPriceRecordRow = typeof priceRecords.$inferInsert;

export const mealPlans = pgTable('meal_plans', {
  id: text('id').primaryKey(),
  weekStartDate: date('week_start_date').notNull().unique(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export type MealPlanRow = typeof mealPlans.$inferSelect;
export type NewMealPlanRow = typeof mealPlans.$inferInsert;

export const plannedRecipes = pgTable(
  'planned_recipes',
  {
    id: text('id').primaryKey(),
    mealPlanId: text('meal_plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id').notNull(),
    scaleFactor: numeric('scale_factor', { precision: 10, scale: 3 }).notNull(),
    scheduledDate: date('scheduled_date'),
    cookedAt: timestamp('cooked_at'),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('planned_recipes_meal_plan_id_idx').on(table.mealPlanId)],
);

export type PlannedRecipeRow = typeof plannedRecipes.$inferSelect;
export type NewPlannedRecipeRow = typeof plannedRecipes.$inferInsert;

export const shoppingLists = pgTable('shopping_lists', {
  id: text('id').primaryKey(),
  mealPlanId: text('meal_plan_id').notNull().unique(),
  // ↑ 集約またぎの ID 参照。FK なし（D-6・C-4 先例）。
  //   UNIQUE = 「1 MealPlan : 最大 1 ShoppingList」不変条件（S-6）＋ findByMealPlanId のインデックスを兼ねる
  shoppingDate: date('shopping_date').notNull(),
  status: text('status').notNull(),
  // null = スナップショット未記録（既存リスト）。Generate / Sync 後は配列。
  coveredIngredients: jsonb('covered_ingredients'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type NewShoppingListRow = typeof shoppingLists.$inferInsert;

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    shoppingListId: text('shopping_list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    productId: text('product_id'),
    displayName: text('display_name').notNull(),
    requiredAmountValue: numeric('required_amount_value', { precision: 10, scale: 3 }),
    requiredAmountUnit: text('required_amount_unit'),
    amountNote: text('amount_note'),
    pantryDeductedAmountValue: numeric('pantry_deducted_amount_value', { precision: 10, scale: 3 }),
    pantryDeductedAmountUnit: text('pantry_deducted_amount_unit'),
    targetStoreId: text('target_store_id'),
    status: text('status').notNull(),
    actualPriceAmount: numeric('actual_price_amount', { precision: 10, scale: 1 }),
    actualStoreId: text('actual_store_id'),
    source: text('source').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('shopping_items_shopping_list_id_idx').on(table.shoppingListId)],
);

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type NewShoppingItemRow = typeof shoppingItems.$inferInsert;

export const stocks = pgTable(
  'stocks',
  {
    id: text('id').primaryKey(),
    productId: text('product_id'),
    displayName: text('display_name').notNull(),
    amountValue: numeric('amount_value', { precision: 10, scale: 3 }).notNull(),
    amountUnit: text('amount_unit').notNull(),
    purchasedAt: timestamp('purchased_at').notNull(),
    expiresAt: date('expires_at'),
    storedLocation: text('stored_location'),
    sourceShoppingItemId: text('source_shopping_item_id').unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('stocks_product_id_idx').on(table.productId)],
);

export type StockRow = typeof stocks.$inferSelect;
export type NewStockRow = typeof stocks.$inferInsert;

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(), // P-8 確定: UNIQUE。onConflictDoUpdate の target
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
