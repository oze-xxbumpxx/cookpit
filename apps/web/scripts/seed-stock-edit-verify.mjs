#!/usr/bin/env node
/**
 * seed-stock-edit-verify.mjs — stock-edit の実画面確認（MB-01〜17）用シード
 *
 * 試験計画 `docs/tests/stock-edit.md` §10-1 の S-1〜S-7 を投入する。
 * 「確認項目の前提条件を満たすデータを選ばず false PASS する」事故が累計 3 回起きているため、
 * 表の全パターンを機械的に投入し、確認スクリプト側で全消化をチェックできるようにする。
 *
 * 使い方: node scripts/seed-stock-edit-verify.mjs   （dev サーバー停止中に実行すること）
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite(join(appRoot, '.pglite-dev'));

/** asOf（= 実行日）からの相対日を YYYY-MM-DD で返す。expires_at は date 型。 */
function day(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 試験計画 §10-1 の表と 1:1 対応させる（列: id / 品名 / 保存場所 / 期限 / 用途）
//
// ⚠️ id は **UUID でなければならない**。`stockIdParamSchema` が `z.uuid()` のため、
// `stock-S-1` のような ID だと編集・消費・廃棄の API が全て 400 になる
// （2026-08-08 の確認で実際に踏んだ。実装の欠陥ではなくシードの不備だった）。
const seeds = [
  {
    id: 'S-1',
    uuid: '11111111-1111-4111-8111-111111111111',
    name: '牛乳',
    loc: 'fridge',
    exp: day(1),
    amount: '2.5',
    unit: '個',
  },
  {
    id: 'S-2',
    uuid: '22222222-2222-4222-8222-222222222222',
    name: '冷凍餃子',
    loc: 'freezer',
    exp: day(20),
    amount: '1',
    unit: '袋',
  },
  {
    id: 'S-3',
    uuid: '33333333-3333-4333-8333-333333333333',
    name: '米',
    loc: 'pantry',
    exp: null,
    amount: '5',
    unit: 'kg',
  },
  {
    id: 'S-4',
    uuid: '44444444-4444-4444-8444-444444444444',
    name: '卵',
    loc: null,
    exp: day(-1),
    amount: '6',
    unit: '個',
  },
  {
    id: 'S-5',
    uuid: '55555555-5555-4555-8555-555555555555',
    name: '玉ねぎ',
    loc: 'fridge',
    exp: day(0),
    amount: '3',
    unit: '個',
  },
  {
    id: 'S-6',
    uuid: '66666666-6666-4666-8666-666666666666',
    name: '味噌',
    loc: 'pantry',
    exp: day(3),
    amount: '1',
    unit: '袋',
  },
  {
    id: 'S-7',
    uuid: '77777777-7777-4777-8777-777777777777',
    name: '塩',
    loc: 'freezer',
    exp: day(4),
    amount: '1',
    unit: '袋',
  },
];

await db.exec('DELETE FROM stocks');

for (const s of seeds) {
  await db.query(
    `INSERT INTO stocks (id, product_id, display_name, amount_value, amount_unit,
       purchased_at, expires_at, stored_location, source_shopping_item_id)
     VALUES ($1, NULL, $2, $3, $4, now(), $5, $6, NULL)`,
    [s.uuid, s.name, s.amount, s.unit, s.exp, s.loc],
  );
}

const rows = await db.query('SELECT id, display_name, expires_at, stored_location FROM stocks');
console.log(JSON.stringify({ seeded: rows.rows.length, rows: rows.rows }, null, 2));
await db.close();
