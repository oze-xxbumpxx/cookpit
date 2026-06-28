import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseServings: integer('base_servings').notNull(),
  cookingTime: integer('cooking_time'),
  tags: text('tags').array().notNull().default([]),
  notes: text('notes').notNull().default(''),
  ingredients: jsonb('ingredients').notNull().default([]),
  steps: jsonb('steps').notNull().default([]),
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
