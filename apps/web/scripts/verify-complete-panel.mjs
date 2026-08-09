#!/usr/bin/env node
/**
 * verify-complete-panel.mjs — 買い物完了パネルの実画面確認（MB-11 / MB-14）
 *
 * MB-12 / MB-13（未入力なら null / 入力した期限が在庫に載る）は E2E
 * `tests/e2e/saturday-flow.spec.ts` が end-to-end で押さえている。本スクリプトは
 * E2E（デスクトップ幅）では見られない **展開 UI の見え方**と **375px でのレイアウト**を確認する。
 *
 * 献立 → 買い物リストの用意まで自分で行うので、事前のシードは不要。
 * 前提: `DATABASE_URL=pglite://.pglite-dev next dev` が起動していること。
 */

import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const results = [];

function record(id, status, detail) {
  results.push({ id, status });
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '－';
  console.log(`${mark} ${id} [${status}] ${detail}`);
}

/** E2E と同じく、他の実行とぶつからない遠い土曜日を作る。 */
function uniqueSaturday(token) {
  let hash = 0;
  for (const c of token) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const base = Date.UTC(2031, 0, 4);
  return new Date(base + (hash % 5000) * 7 * 86400000).toISOString().slice(0, 10);
}

const token = randomUUID().slice(0, 8);
const recipeName = `MB確認-${token}`;
const ingredientName = `MB食材-${token}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// 375px（iPhone SE 相当）で通す。パネルのレイアウトはこの幅が最も厳しい。
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

let recipeId = null;
try {
  // --- 前提づくり: レシピ → 献立 → 買い物リスト ---
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
      steps: [{ description: 'MB 確認用' }],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
    },
  });
  recipeId = (await created.json()).id;

  const saturday = uniqueSaturday(token);
  await page.goto(`${BASE}/meal-plans?week=${saturday}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'この週の献立を作る' }).click();
  await page.getByRole('button', { name: 'レシピを追加' }).click();
  await page.getByPlaceholder('レシピを検索').fill(recipeName);
  await page.getByRole('button', { name: recipeName, exact: true }).click();
  await page.getByRole('button', { name: '献立に追加' }).click();
  await page.getByRole('button', { name: '買い物リストを作る' }).click();
  await page.waitForURL(/\/shopping-lists\/[^/]+$/);

  // 在庫化の対象にするため 1 件を bought にする
  await page.getByRole('checkbox', { name: `${ingredientName}をチェックする` }).click();
  await page.getByRole('button', { name: '買い物完了' }).click();
  await page.getByRole('heading', { name: '在庫に追加する品目' }).waitFor({ state: 'visible' });

  const panel = page.locator('section').filter({ hasText: '在庫に追加する品目' }).first();

  // MB-11: 既定は非表示。「賞味期限を設定」で独立行が展開される
  {
    const before = await page.getByLabel('賞味期限').count();
    const heightBefore = await panel.evaluate((el) => el.getBoundingClientRect().height);
    const expandedBefore = await page
      .getByRole('button', { name: '賞味期限を設定' })
      .first()
      .getAttribute('aria-expanded');

    await page.getByRole('button', { name: '賞味期限を設定' }).first().click();

    const after = await page.getByLabel('賞味期限').count();
    const heightAfter = await panel.evaluate((el) => el.getBoundingClientRect().height);
    const expandedAfter = await page
      .getByRole('button', { name: '賞味期限を削除' })
      .first()
      .getAttribute('aria-expanded');

    const ok =
      before === 0 && after === 1 && expandedBefore === 'false' && expandedAfter === 'true';
    record(
      'MB-11',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `既定は入力欄 0 個・aria-expanded=false（パネル高 ${Math.round(heightBefore)}px）→ 展開で入力欄 1 個・aria-expanded=true・文言が「賞味期限を削除」へ（高さ ${Math.round(heightAfter)}px）。Q-1 の「縦に長くなる」懸念どおり既定状態は変わらない`
        : `before=${before} after=${after} expandedBefore=${expandedBefore} expandedAfter=${expandedAfter}`,
    );
  }

  // MB-14: 375px で日付入力行を展開してもレイアウトが崩れない
  {
    await page.getByLabel('賞味期限').fill('2030-12-24');
    const doc = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    const overflow = await panel.evaluate((root) => {
      const out = [];
      for (const el of root.querySelectorAll('p, label, input, button')) {
        if (el.scrollWidth > el.clientWidth + 1) out.push((el.textContent || el.tagName).trim());
      }
      return out;
    });
    // 日付入力が数量・保存場所と同じ横並び行に入っていないこと（P-3 案 A の排除）
    const sameRowAsQuantity = await panel.evaluate(() => {
      const date = document.querySelector('input[type="date"]');
      const qty = document.querySelector('input[placeholder*="3個"], input[inputmode="text"]');
      if (date === null || qty === null) return false;
      return Math.abs(date.getBoundingClientRect().top - qty.getBoundingClientRect().top) < 4;
    });

    const ok = doc.scrollW <= doc.clientW + 1 && overflow.length === 0 && !sameRowAsQuantity;
    await page.screenshot({ path: 'scripts/.verify-complete-panel-375.png', fullPage: true });
    record(
      'MB-14',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `375px で横スクロールなし（scrollW=${doc.scrollW} / clientW=${doc.clientW}）・はみ出しなし・日付入力は数量の横ではなく独立行`
        : `横スクロール=${doc.scrollW > doc.clientW} / はみ出し=${JSON.stringify(overflow)} / 数量と同じ行=${sameRowAsQuantity}`,
    );
  }
} catch (error) {
  record('FATAL', 'FAIL', `スクリプトが例外で停止: ${error.message}`);
} finally {
  if (recipeId !== null) {
    await page.request.delete(`${BASE}/api/recipes/${recipeId}`).catch(() => {});
  }
  await browser.close();
}

const fails = results.filter((r) => r.status === 'FAIL');
console.log(
  `\n===== summary =====\nPASS: ${results.length - fails.length} / FAIL: ${fails.length}`,
);
process.exit(fails.length > 0 ? 1 : 0);
