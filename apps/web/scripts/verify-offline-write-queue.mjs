#!/usr/bin/env node
/**
 * verify-offline-write-queue.mjs — オフライン書き込みキューの実画面確認
 *
 * MB-01 の Chromium 代替（DevTools 相当の offline）と MB-04（未送信表示）。
 * iPhone Safari PWA・2 台同期・7 日保持・低速回線は本環境では確認不可。
 *
 * 前提: `DATABASE_URL=pglite://.pglite-dev next dev` が起動していること。
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const shotDir = dirname(fileURLToPath(import.meta.url));
const shot = (name) => join(shotDir, `.verify-offline-${name}.png`);
const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '－';
  console.log(`${mark} ${id} [${status}] ${detail}`);
}

function uniqueSaturday(token) {
  let hash = 0;
  for (const c of token) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const base = Date.UTC(2031, 0, 4);
  return new Date(base + (hash % 5000) * 7 * 86400000).toISOString().slice(0, 10);
}

const token = randomUUID().slice(0, 8);
const recipeName = `OQ確認-${token}`;
const ingredientName = `OQ食材-${token}`;
const banner = 'オフライン中の変更があります。オンラインになると自動的に送信されます。';

const launchOptions = {};
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

try {
  const created = await page.request.post(`${BASE}/api/recipes`, {
    data: {
      name: recipeName,
      ingredients: [
        {
          productRef: null,
          displayName: ingredientName,
          amountValue: 2,
          amountUnit: '個',
          amountNote: null,
        },
      ],
      steps: [{ description: 'オフラインキュー確認用' }],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
    },
  });
  if (!created.ok()) {
    throw new Error(`recipe create failed: ${created.status()} ${await created.text()}`);
  }

  const saturday = uniqueSaturday(token);
  await page.goto(`${BASE}/meal-plans?week=${saturday}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'この週の献立を作る' }).click();
  await page.getByRole('button', { name: 'レシピを追加' }).click();
  await page.getByPlaceholder('レシピを検索').fill(recipeName);
  await page.getByRole('button', { name: recipeName, exact: true }).click();
  await page.getByRole('button', { name: '献立に追加' }).click();
  await page.getByRole('button', { name: '買い物リストを作る' }).click();
  await page.waitForURL(/\/shopping-lists\/[^/]+$/);

  const checkbox = page.getByRole('checkbox', { name: ingredientName });
  await checkbox.waitFor({ state: 'visible' });

  await context.setOffline(true);
  await checkbox.click();

  const unsynced = page.getByText('未送信', { exact: true });
  const bannerEl = page.getByText(banner);
  try {
    await unsynced.waitFor({ state: 'visible', timeout: 8000 });
    await bannerEl.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    await page.screenshot({ path: shot('offline-fail'), fullPage: true });
    record('MB-01', 'FAIL', 'オフライン後に「未送信」またはバナーが出なかった');
    record('MB-04', 'FAIL', '未送信表示の確認まで到達しなかった');
    throw new Error('offline enqueue UI did not appear');
  }

  const stillChecked = await checkbox.getAttribute('aria-checked');
  await page.screenshot({ path: shot('offline'), fullPage: true });
  record(
    'MB-04',
    stillChecked === 'true' ? 'PASS' : 'FAIL',
    stillChecked === 'true'
      ? 'オフライン中に行の「未送信」と上部バナーが出て、チェック状態も保持された'
      : `未送信表示は出たが aria-checked=${stillChecked}`,
  );

  await context.setOffline(false);
  try {
    await unsynced.waitFor({ state: 'hidden', timeout: 15000 });
    await bannerEl.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    await page.screenshot({ path: shot('online-fail'), fullPage: true });
    record('MB-01', 'FAIL', 'オンライン復帰後も「未送信」が残った（再送失敗）');
    throw new Error('flush did not clear pending UI');
  }

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = page.getByRole('checkbox', { name: ingredientName });
  const persisted = (await afterReload.getAttribute('aria-checked')) === 'true';
  await page.screenshot({ path: shot('after-reload'), fullPage: true });
  record(
    'MB-01',
    persisted ? 'PASS' : 'FAIL',
    persisted
      ? 'Chromium の offline → チェック → オンライン復帰 → 再読み込み後もチェックが残った（iPhone PWA 実機の代替）'
      : '再読み込み後にチェックが消えた。サーバーへ届いていない',
  );

  record(
    'MB-02',
    'BLOCKED',
    '理由: 2 台の端末（または独立プロファイル）を同時に用意できない。完全確認には iPhone と Android が必要',
  );
  record(
    'MB-03',
    'BLOCKED',
    '理由: 7 日間の実時間待機は期間内にできない。TTL 24h が先に効く設計のため実害は小さい',
  );
  record(
    'MB-05',
    'BLOCKED',
    '理由: 極端に遅い回線の再現は困難。試験計画どおり完了条件のブロッカーではない',
  );
} catch (error) {
  if (!results.some((row) => row.id === 'MB-01')) {
    record('MB-01', 'FAIL', error instanceof Error ? error.message : String(error));
  }
  if (!results.some((row) => row.id === 'MB-04')) {
    record('MB-04', 'BLOCKED', 'MB-01 の前提づくりまたはオフライン操作で中断');
  }
  for (const id of ['MB-02', 'MB-03', 'MB-05']) {
    if (!results.some((row) => row.id === id)) {
      record(id, 'BLOCKED', 'スクリプトが途中で失敗したため未実施');
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((row) => row.status === 'FAIL');
console.log('');
console.log(
  `summary: ${results.filter((row) => row.status === 'PASS').length} PASS / ${
    results.filter((row) => row.status === 'BLOCKED').length
  } BLOCKED / ${failed.length} FAIL`,
);
process.exit(failed.length > 0 ? 1 : 0);
