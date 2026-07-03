import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { DrizzleClient } from '../db/client';
import * as schema from '../db/schema';

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
`;

export async function createTestDb(): Promise<DrizzleClient> {
  const pglite = new PGlite();
  await pglite.exec(DDL);
  const db = drizzle(pglite, { schema });
  // Repository は neon-http ドライバ由来の DrizzleClient 型を受け取るが、
  // テストでは pglite ドライバを使うため型だけ合わせる（プロダクションコード変更 0 を維持）。
  return db as unknown as DrizzleClient;
}
