#!/usr/bin/env node
/**
 * capture-screenshots.mjs — README 掲載用のスクリーンショットを決定論的に生成する
 *
 * 本番は認証で保護されており外部から画面を見られないため、公開リポジトリの閲覧者に
 * 画面を伝える手段が README の画像しかない。手で撮ると再現性が無く、画面変更のたびに
 * 古い画像が残るので、シード済み PGlite に対して Playwright で撮り直せるようにする。
 *
 * 使い方:
 *   pnpm --filter @cookpit/web db:seed:pglite                    # DB を作り直す
 *   DATABASE_URL=pglite://.pglite-dev pnpm --filter @cookpit/web dev   # 別ターミナルで起動
 *   pnpm --filter @cookpit/web screenshots                       # 撮影
 *
 * 撮影対象は「土曜フロー」（献立 → 買い物リスト → 在庫）と、価格比較・レシピ詳細。
 * 週は固定の未来の土曜日を使い、実行日に依存させない。
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appRoot, '../../docs/assets/screenshots');
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// setup-pglite-dev.mjs のシードと同じ固定 ID。
const RECIPE_NIKUJAGA = '00000000-0000-4000-8000-000000000301';
const PRODUCT_ONION = '00000000-0000-4000-8000-000000000101';

// 実行日に依存させないための固定の未来の土曜日。
const SATURDAY = '2030-01-05';

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  // 2 人がスマートフォンで使う PWA なので、実際の利用状況に合わせた縦長ビューポートで撮る。
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
});
const page = await context.newPage();

// dev サーバーからしか撮れない（本番は認証で保護されている）ため、dev 専用の
// Next.js ツールバー／Issue バッジが画面左下に重なり、ボトムナビの「ホーム」を隠す。
// アプリ側の設定は変えず、撮影直前に CSS を差し込むだけに留める。
// addInitScript は DOM 生成前に走り効かないため、各撮影時に addStyleTag で注入する。
const HIDE_DEV_OVERLAY = 'nextjs-portal { display: none !important; }';

let shotCount = 0;
async function shot(name) {
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  shotCount += 1;
  console.log(`captured: ${name}.png`);
}

try {
  await page.goto(`${baseURL}/recipes`);
  await page.getByRole('heading', { name: 'レシピ' }).waitFor();
  await shot('01-recipes');

  await page.goto(`${baseURL}/recipes/${RECIPE_NIKUJAGA}`);
  await page.getByRole('heading', { name: '肉じゃが' }).waitFor();
  await shot('02-recipe-detail');

  await page.goto(`${baseURL}/products/${PRODUCT_ONION}`);
  await page.getByRole('heading', { name: '玉ねぎ' }).waitFor();
  await shot('03-product-price-comparison');

  // --- 土曜フロー: 献立を作り、レシピを追加する ---
  await page.goto(`${baseURL}/meal-plans?week=${SATURDAY}`);
  await page.getByRole('heading', { name: '献立' }).waitFor();
  const createPlan = page.getByRole('button', { name: 'この週の献立を作る' });
  if (await createPlan.isVisible().catch(() => false)) {
    await createPlan.click();
    await page.getByText('献立作成中', { exact: true }).waitFor();
  }

  await page.getByRole('button', { name: 'レシピを追加' }).click();
  await page.getByPlaceholder('レシピを検索').fill('肉じゃが');
  await page.getByRole('button', { name: '肉じゃが', exact: true }).click();
  await page.getByRole('button', { name: '2×', exact: true }).click();
  await page.getByRole('button', { name: '献立に追加' }).click();
  await page.getByRole('link', { name: '肉じゃが', exact: true }).waitFor();
  await shot('04-meal-plan');

  // --- 買い物リストを生成し、1 件だけ購入済みにする ---
  await page.getByRole('button', { name: '買い物リストを作る' }).click();
  await page.waitForURL(/\/shopping-lists\/[^/]+$/);
  await page.getByText('玉ねぎ', { exact: true }).first().waitFor();
  await page.getByRole('checkbox', { name: '玉ねぎをチェックする' }).click();
  await page.getByRole('checkbox', { name: '玉ねぎのチェックを外す' }).waitFor();
  await shot('05-shopping-list');

  // --- 買い物を完了し、在庫化する ---
  await page.getByRole('button', { name: '買い物完了' }).click();
  await page.getByRole('heading', { name: '在庫に追加する品目' }).waitFor();
  await page.getByRole('button', { name: '完了する' }).click();
  await page.getByText('買い物を完了しました', { exact: true }).waitFor();

  await page.goto(`${baseURL}/pantry`);
  await page.getByRole('heading', { name: '在庫' }).waitFor();
  await shot('06-pantry');

  console.log(`\n${shotCount} screenshots written to ${outDir}`);
} finally {
  await context.close();
  await browser.close();
}
