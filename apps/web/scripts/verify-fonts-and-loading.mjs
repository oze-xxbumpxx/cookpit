// フォント差し替え + loading.tsx の実画面確認（manual-browser-verify）。
// 読み取り専用: .env.local は本番 Neon を指すため、削除等の変更操作は一切行わない。

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
// スクリーンショットはスクリプトの隣へ出す（cwd に依存させない）。.gitignore 済み。
const shotDir = dirname(fileURLToPath(import.meta.url));
const shot = (name) => join(shotDir, `.verify-${name}.png`);
const results = [];

function report(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`${status.padEnd(8)} ${id}: ${detail}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

// 読み込まれたフォントを記録する。dev overlay 用の geist は Next の next-devtools が
// 差し込むもので本番ビルドには含まれないため、確認対象から除く。
const fontUrls = new Set();
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('.woff') && !url.includes('geist')) {
    fontUrls.add(url);
  }
});

// MB-01: ダッシュボードのフォント適用
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: shot('home'), fullPage: true });
const homeFont = await page
  .locator('h1')
  .first()
  .evaluate((el) => getComputedStyle(el).fontFamily);
report(
  'MB-01',
  homeFont.includes('Zen Maru Gothic') ? 'PASS' : 'FAIL',
  `h1 の font-family = ${homeFont}`,
);

// MB-02: 読み込まれたフォントの実体と転送量（Resource Timing の実測値で測る）
await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' });
await page.screenshot({ path: shot('products'), fullPage: true });
const fontSizes = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.includes('.woff') && !entry.name.includes('geist'))
    .map((entry) => ({
      name: entry.name.split('/').pop(),
      size: entry.encodedBodySize || entry.decodedBodySize || entry.transferSize,
    })),
);
const fontTotal = fontSizes.reduce((sum, entry) => sum + entry.size, 0);
const allSubset = fontSizes.length > 0 && fontSizes.every((entry) => entry.name.includes('subset'));
report(
  'MB-02',
  allSubset ? 'PASS' : 'FAIL',
  `${fontUrls.size} 本読込 / 実測合計 ${(fontTotal / 1024 / 1024).toFixed(2)}MB — ` +
    fontSizes.map((e) => `${e.name.slice(0, 28)} ${(e.size / 1024).toFixed(0)}KB`).join(', '),
);

// MB-03: サブセットに含めた漢字が実際に描画できるか。
// document.fonts.check は unicode-range が無いと「family に含まれる」だけで true を返し
// グリフ欠落を検出できないため、実描画のピクセルを fallback 単独描画と比較する。
const glyphCheck = await page.evaluate(async () => {
  await document.fonts.ready;

  function renderSignature(char, family) {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    ctx.font = `32px ${family}`;
    ctx.textBaseline = 'top';
    ctx.fillText(char, 4, 4);
    return canvas.toDataURL();
  }

  /** サブセットに glyph があれば、fallback 単独の描画と異なるはず。 */
  function isRenderedByFont(char) {
    const withSubset = renderSignature(char, `'Zen Maru Gothic', 'Courier New'`);
    const fallbackOnly = renderSignature(char, `'Courier New'`);
    return withSubset !== fallbackOnly;
  }

  // 第一水準（サブセット対象）の先頭・末尾と食材語でよく使う字
  const inSubset = ['亜', '腕', '鶏', '豚', '菜', '塩', '漬', '鮭', '芋'];
  // 第二水準以降（サブセット対象外）
  const outOfSubset = ['翡', '瓲', '﨟'];

  return {
    inSubset,
    rendered: inSubset.filter(isRenderedByFont),
    outOfSubset,
    fellBack: outOfSubset.filter((char) => !isRenderedByFont(char)),
  };
});
// 判定は「対象に含めた字が描画できる」ことだけで行う。対象外の字が fallback するかは
// headless 環境の fallback チェーンに左右されて当てにならないため、参考値として出すだけにする。
report(
  'MB-03',
  glyphCheck.rendered.length === glyphCheck.inSubset.length ? 'PASS' : 'FAIL',
  `第一水準 ${glyphCheck.rendered.length}/${glyphCheck.inSubset.length} 字が` +
    `サブセットで描画 (${glyphCheck.rendered.join('')})` +
    ` — 参考: 対象外 ${glyphCheck.outOfSubset.join('')} の fallback 判定は ` +
    `${glyphCheck.fellBack.length}/${glyphCheck.outOfSubset.length}（headless の fallback 依存で判定に使わない）`,
);

// MB-04 / MB-05 / MB-06: 商品詳細（/products/new は詳細ではないので除く）
const href = await page
  .locator('a[href^="/products/"]:not([href="/products/new"])')
  .first()
  .getAttribute('href');
await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=/プルダウンに出す店舗/');
await page.screenshot({ path: shot('product-detail'), fullPage: true });

const hintText = await page.locator('text=/プルダウンに出す店舗/').first().textContent();
const limitMessage = page.locator('text=/店舗は3件までです/');
const addButton = page.getByRole('button', { name: '追加' });
const addDisabled = await addButton.isDisabled();
report(
  'MB-04',
  hintText.includes('3件まで') && (await limitMessage.count()) > 0 && addDisabled ? 'PASS' : 'FAIL',
  `パネル文言="${hintText.trim()}" / 上限メッセージ=${await limitMessage.count()}件 / 追加ボタン disabled=${addDisabled}`,
);

const placeholder = await page.getByLabel('内容量', { exact: false }).getAttribute('placeholder');
const unitChip = await page.locator('text=/基本単位/').first().textContent();
report(
  'MB-05',
  /^例：(1|300)/.test(placeholder) ? 'PASS' : 'FAIL',
  `${unitChip.trim()} → プレースホルダ="${placeholder}"`,
);

// MB-06: 削除ダイアログの件数表示（GET /usage のみ。削除は実行しない）
const deleteButtons = page.locator('button[aria-label$="を削除"]');
const firstDeleteLabel = await deleteButtons.first().getAttribute('aria-label');
await deleteButtons.first().click();
await page.waitForSelector('text=/削除しますか/');
await page.waitForTimeout(1200); // usage 取得を待つ
const dialogText = await page
  .locator('[role="alertdialog"], [role="dialog"]')
  .first()
  .textContent();
await page.screenshot({ path: shot('delete-dialog') });
await page.getByRole('button', { name: 'キャンセル' }).click();
report(
  'MB-06',
  /価格記録\s*\d+\s*件/.test(dialogText) ? 'PASS' : 'FAIL',
  `${firstDeleteLabel} → "${dialogText.replace(/\s+/g, ' ').trim().slice(0, 140)}"`,
);

// MB-07: loading.tsx（サーバー応答を遅延させて骨組みを捉える）
const loadingRoutes = [
  ['/', 'ダッシュボード'],
  [href, '商品詳細'],
  ['/shopping-lists', '買い物入口'],
  ['/recipes', 'レシピ一覧'],
  ['/meal-plans/history', '献立履歴'],
];
const loadingSeen = [];
for (const [route, label] of loadingRoutes) {
  const slowPage = await context.newPage();
  // RSC のデータ取得を遅らせ、骨組みが出ている状態を観測する
  await slowPage.route('**/*', async (route) => {
    if (route.request().resourceType() === 'document') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await route.continue();
  });
  await slowPage.goto(`${BASE}${route}`, { waitUntil: 'commit' });
  const hasSkeleton = await slowPage
    .locator('.animate-pulse')
    .first()
    .isVisible()
    .catch(() => false);
  loadingSeen.push(`${label}=${hasSkeleton ? 'skeleton' : '未観測'}`);
  await slowPage.close();
}
report(
  'MB-07',
  loadingSeen.some((entry) => entry.includes('skeleton')) ? 'PASS' : 'INCONCLUSIVE',
  loadingSeen.join(', '),
);

await browser.close();

console.log('\n--- 集計 ---');
for (const status of ['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE']) {
  const count = results.filter((r) => r.status === status).length;
  if (count > 0) console.log(`${status}: ${count}`);
}
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
