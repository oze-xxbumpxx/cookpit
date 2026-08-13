import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { DrizzleClient } from '../../src/db/client';
import * as schema from '../../src/db/schema';

// schema.ts の 4 テーブル定義と機械的に対応させた DDL。
// migrations フォルダが存在しないため schema.ts を正典として直接適用する（設計書 §5.4 案 b）。
const DDL = `
CREATE TABLE IF NOT EXISTS recipes (
  id text PRIMARY KEY,
  name text NOT NULL,
  base_servings integer NOT NULL,
  cooking_time integer,
  tags text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  ingredients jsonb NOT NULL DEFAULT '[]',
  steps jsonb NOT NULL DEFAULT '[]',
  servings integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL,
  default_unit text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_records (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  price_amount numeric(10, 1) NOT NULL,
  unit_price_amount numeric(10, 1) NOT NULL,
  package_size_value numeric(10, 3) NOT NULL,
  package_size_unit text NOT NULL,
  observed_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_records_product_id_idx ON price_records (product_id);

CREATE TABLE IF NOT EXISTS meal_plans (
  id text PRIMARY KEY,
  week_start_date date NOT NULL UNIQUE,
  status text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS planned_recipes (
  id text PRIMARY KEY,
  meal_plan_id text NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id text NOT NULL,
  scale_factor numeric(10, 3) NOT NULL,
  scheduled_date date,
  cooked_at timestamp,
  notes text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planned_recipes_meal_plan_id_idx ON planned_recipes (meal_plan_id);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id text PRIMARY KEY,
  meal_plan_id text NOT NULL UNIQUE,
  shopping_date date NOT NULL,
  status text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id text PRIMARY KEY,
  shopping_list_id text NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id text,
  display_name text NOT NULL,
  required_amount_value numeric(10, 3),
  required_amount_unit text,
  amount_note text,
  target_store_id text,
  status text NOT NULL,
  actual_price_amount numeric(10, 1),
  actual_store_id text,
  source text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_items_shopping_list_id_idx ON shopping_items (shopping_list_id);

CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY,
  product_id text,
  display_name text NOT NULL,
  amount_value numeric(10, 3) NOT NULL,
  amount_unit text NOT NULL,
  purchased_at timestamp NOT NULL,
  expires_at date,
  stored_location text,
  source_shopping_item_id text UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocks_product_id_idx ON stocks (product_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id text PRIMARY KEY,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
`;

export async function createTestDb(): Promise<DrizzleClient> {
  const pglite = new PGlite();
  await pglite.exec(DDL);
  const db = drizzle(pglite, { schema });
  // Repository は neon-serverless ドライバ由来の DrizzleClient 型を受け取るが、
  // テストでは pglite ドライバを使うため型だけ合わせる。
  return db as unknown as DrizzleClient;
}

export { DrizzleUnitOfWork } from '../../src/uow/drizzle-unit-of-work';
