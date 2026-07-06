#!/usr/bin/env node
/**
 * setup-pglite-dev.mjs — dev 専用のファイルバック PGlite DB を準備する
 *
 * リモート（エフェメラル）環境には DATABASE_URL が無く、実画面確認が常に BLOCKED だった。
 * このスクリプトが `.pglite-dev/` に PGlite DB を作り、実マイグレーション
 * （src/db/migrations/）を適用し、画面が描画できる最小シードを投入する。
 *
 * 使い方:
 *   pnpm --filter @cookpit/web dev:pglite       # 準備 + DATABASE_URL=pglite://.pglite-dev で next dev
 *   pnpm --filter @cookpit/web db:seed:pglite   # --fresh で作り直し
 *
 * 本番経路（Neon）には一切触れない。シードは ON CONFLICT DO NOTHING で冪等。
 */

import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(appRoot, '.pglite-dev');

if (process.argv.includes('--fresh') && existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`recreated: ${dataDir}`);
}

const db = new PGlite(dataDir);

// ---- マイグレーション適用（drizzle journal を直接読む。適用済み tag はスキップ） ----
const migrationsDir = join(appRoot, 'src/db/migrations');
const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8'));

await db.exec(
  `CREATE TABLE IF NOT EXISTS __pglite_migrations (
     tag text PRIMARY KEY,
     applied_at timestamp NOT NULL DEFAULT now()
   )`,
);

for (const entry of journal.entries) {
  const done = await db.query('SELECT 1 FROM __pglite_migrations WHERE tag = $1', [entry.tag]);
  if (done.rows.length > 0) continue;
  const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) await db.exec(s);
  }
  await db.query('INSERT INTO __pglite_migrations (tag) VALUES ($1)', [entry.tag]);
  console.log(`migration applied: ${entry.tag}`);
}

// ---- シード（固定 ID・冪等。画面が空にならない最小構成） ----
const SEED = `
INSERT INTO stores (id, name) VALUES
  ('00000000-0000-4000-8000-000000000001', 'スーパーA'),
  ('00000000-0000-4000-8000-000000000002', '業務スーパーB')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, aliases, category, default_unit) VALUES
  ('00000000-0000-4000-8000-000000000101', '玉ねぎ', ARRAY['たまねぎ','オニオン']::text[], '野菜', '個'),
  ('00000000-0000-4000-8000-000000000102', '豚こま切れ肉', ARRAY[]::text[], '肉', 'g'),
  ('00000000-0000-4000-8000-000000000103', '醤油', ARRAY['しょうゆ']::text[], '調味料', 'ml')
ON CONFLICT (id) DO NOTHING;

INSERT INTO price_records
  (id, product_id, store_id, price_amount, unit_price_amount, package_size_value, package_size_unit, observed_at) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', 158.0, 52.7, 3.000, '個', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000002', 128.0, 42.7, 3.000, '個', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', 328.0, 1.1, 300.000, 'g', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipes (id, name, base_servings, cooking_time, tags, notes, ingredients, steps, servings) VALUES
  ('00000000-0000-4000-8000-000000000301', '肉じゃが', 4, 40,
   ARRAY['主菜','作り置き向き']::text[], '週末の作り置き定番',
   '[{"productRef":"00000000-0000-4000-8000-000000000102","displayName":"豚こま切れ肉","amountValue":300,"amountUnit":"g","amountNote":null},
     {"productRef":"00000000-0000-4000-8000-000000000101","displayName":"玉ねぎ","amountValue":1,"amountUnit":"個","amountNote":null},
     {"productRef":null,"displayName":"じゃがいも","amountValue":3,"amountUnit":"個","amountNote":null}]'::jsonb,
   '[{"description":"じゃがいもと玉ねぎを一口大に切る"},
     {"description":"肉と野菜を炒め、だし・調味料を加えて煮る"},
     {"description":"落とし蓋をして中火で15分煮込む"}]'::jsonb,
   4),
  ('00000000-0000-4000-8000-000000000302', 'わかめと豆腐の味噌汁', 2, 10,
   ARRAY['汁物']::text[], '',
   '[{"productRef":null,"displayName":"わかめ","amountValue":5,"amountUnit":"g","amountNote":null},
     {"productRef":null,"displayName":"豆腐","amountValue":150,"amountUnit":"g","amountNote":null}]'::jsonb,
   '[{"description":"だしを取り、具材を加える"},
     {"description":"火を止めて味噌を溶く"}]'::jsonb,
   2),
  ('00000000-0000-4000-8000-000000000303', 'チキン南蛮', 2, 30,
   ARRAY['主菜','冷凍可']::text[], 'タルタルは市販でも可',
   '[{"productRef":null,"displayName":"鶏もも肉","amountValue":300,"amountUnit":"g","amountNote":null},
     {"productRef":"00000000-0000-4000-8000-000000000103","displayName":"醤油","amountValue":30,"amountUnit":"ml","amountNote":null},
     {"productRef":null,"displayName":"タルタルソース","amountValue":null,"amountUnit":null,"amountNote":"市販でも可"}]'::jsonb,
   '[{"description":"鶏肉に衣をつけて揚げ焼きにする"},
     {"description":"南蛮酢に漬け、タルタルソースをかける"}]'::jsonb,
   2)
ON CONFLICT (id) DO NOTHING;
`;

await db.exec(SEED);

const counts = await db.query(
  `SELECT (SELECT count(*) FROM recipes) AS recipes,
          (SELECT count(*) FROM stores) AS stores,
          (SELECT count(*) FROM products) AS products,
          (SELECT count(*) FROM price_records) AS price_records`,
);
await db.close();

console.log(`PGlite dev DB ready: ${dataDir}`);
console.log(JSON.stringify(counts.rows[0]));
