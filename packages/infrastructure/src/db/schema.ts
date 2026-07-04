import { index, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

export const priceRecords = pgTable('price_records', {
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
}, (table) => [
  index('price_records_product_id_idx').on(table.productId),
]);

export type PriceRecordRow = typeof priceRecords.$inferSelect;
export type NewPriceRecordRow = typeof priceRecords.$inferInsert;
