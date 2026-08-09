#!/usr/bin/env node
/**
 * verify-stock-edit.mjs — stock-edit の実画面確認（試験計画 docs/tests/stock-edit.md §10-2 MB-01〜17）
 *
 * 前提: `node scripts/seed-stock-edit-verify.mjs` で S-1〜S-7 を投入し、
 *       `DATABASE_URL=pglite://.pglite-dev next dev` が起動していること。
 *
 * 設計方針:
 * - セレクタは role / label ベース（CSS クラス依存を避ける）。
 * - 各項目を PASS / FAIL / BLOCKED(理由) で機械的に出力する。
 * - **シードデータ全消化チェック**を最後に行う（S-1〜S-7 のうち一度も使われなかったものが
 *   あれば警告する。「該当データが無いので確認できず」を PASS にしないための仕掛け）。
 */

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const results = [];
const usedSeeds = new Set();

function record(id, status, detail, seeds = []) {
  results.push({ id, status, detail });
  for (const s of seeds) usedSeeds.add(s);
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '－';
  console.log(`${mark} ${id} [${status}] ${detail}`);
}

/** 在庫カード（<li>）を品目名で取得する。 */
function card(page, name) {
  return page.locator('li').filter({ hasText: name }).first();
}

/** 品目名のカードの「編集」ボタンを押してダイアログを開く。 */
async function openEditDialog(page, name) {
  await card(page, name).getByRole('button', { name: '編集' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'visible' });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

try {
  await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });

  // ---- 表示系（MB-07〜10）を先に確認する（編集で状態を壊す前に見る） ----

  // MB-07: 閾値内（S-1 = +1日 / S-5 = 当日 / S-6 = +3日ちょうど）にチップが出る
  {
    const checks = [
      ['牛乳', '明日まで'],
      ['玉ねぎ', '本日まで'],
      ['味噌', 'あと3日'],
    ];
    const bad = [];
    for (const [name, label] of checks) {
      const has = await card(page, name).getByText(label, { exact: true }).count();
      if (has === 0) bad.push(`${name} に「${label}」が無い`);
    }
    record(
      'MB-07',
      bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0 ? '牛乳=明日まで / 玉ねぎ=本日まで / 味噌=あと3日 を確認' : bad.join(' / '),
      ['S-1', 'S-5', 'S-6'],
    );
  }

  // MB-08: 閾値外（S-2 = +20日 / S-7 = +4日）にチップが出ない
  {
    const bad = [];
    for (const name of ['冷凍餃子', '塩']) {
      const c = card(page, name);
      const texts = ['期限切れ', '本日まで', '明日まで'];
      for (const t of texts) {
        if ((await c.getByText(t, { exact: true }).count()) > 0) bad.push(`${name} に「${t}」`);
      }
      if ((await c.getByText(/^あと\d+日$/).count()) > 0) bad.push(`${name} に「あとN日」`);
    }
    record(
      'MB-08',
      bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0
        ? '冷凍餃子(+20日) / 塩(+4日) にチップ無し。S-6(+3日)との境界が正しい'
        : bad.join(' / '),
      ['S-2', 'S-7'],
    );
  }

  // MB-09: 期限切れ（S-4 = -1日）に「期限切れ」チップが出る
  {
    const has = await card(page, '卵').getByText('期限切れ', { exact: true }).count();
    record(
      'MB-09',
      has > 0 ? 'PASS' : 'FAIL',
      has > 0 ? '卵（期限切れ）に「期限切れ」チップを確認' : '卵に「期限切れ」チップが無い',
      ['S-4'],
    );
  }

  // MB-10: 保存場所ラベルが全カードに常時表示（期限の有無に関わらず）
  {
    const expect = [
      ['牛乳', '冷蔵'],
      ['冷凍餃子', '冷凍'],
      ['米', '常温'],
      ['卵', '保存場所未設定'],
      ['玉ねぎ', '冷蔵'],
      ['味噌', '常温'],
      ['塩', '冷凍'],
    ];
    const bad = [];
    for (const [name, label] of expect) {
      const has = await card(page, name).getByText(`保存場所: ${label}`).count();
      if (has === 0) bad.push(`${name}→${label}`);
    }
    record(
      'MB-10',
      bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0
        ? '7 件すべてに保存場所ラベル（未設定含む）を確認'
        : `ラベル欠落: ${bad.join(', ')}`,
      ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7'],
    );
  }

  // ---- 編集系（MB-01〜06）。リロードして DB 反映を確認するのが要点 ----

  // MB-02: 数量の「単位のみ」変更 → リロードで保持（罠 2 の直接検出）
  {
    await openEditDialog(page, '牛乳');
    const qty = page.getByRole('alertdialog').getByLabel('数量');
    await qty.fill('2.5g'); // 値 2.5 据え置き・単位 個 → g
    await page.getByRole('alertdialog').getByRole('button', { name: '保存' }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const text = await card(page, '牛乳').innerText();
    const ok = text.includes('2.5g');
    record(
      'MB-02',
      ok ? 'PASS' : 'FAIL',
      ok
        ? '牛乳を 2.5個→2.5g（値据え置き・単位のみ）に変更しリロード後も保持'
        : `表示: ${text.replace(/\n/g, ' / ')}`,
      ['S-1'],
    );
  }

  // MB-18: 編集の成功が **リロードなしで** 一覧へ反映される
  // （PantryClient は stocks を useState で持つため、router.refresh() だけでは反映されない）
  {
    await openEditDialog(page, '味噌');
    await page.getByRole('alertdialog').getByLabel('数量').fill('9袋');
    await page.getByRole('alertdialog').getByRole('button', { name: '保存' }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.waitForTimeout(800); // リロードはしない
    const text = await card(page, '味噌').innerText();
    const ok = text.includes('9袋');
    record(
      'MB-18',
      ok ? 'PASS' : 'FAIL',
      ok
        ? '味噌を 1袋→9袋 に編集し、リロードせずに一覧へ反映されることを確認'
        : `リロードなしで一覧が更新されない。表示: ${text.replace(/\n/g, ' / ')}`,
      ['S-6'],
    );
  }

  // MB-01: 数量の値を変更 → リロードで保持
  {
    await openEditDialog(page, '米');
    await page.getByRole('alertdialog').getByLabel('数量').fill('3kg');
    await page.getByRole('alertdialog').getByRole('button', { name: '保存' }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const text = await card(page, '米').innerText();
    const ok = text.includes('3kg');
    record(
      'MB-01',
      ok ? 'PASS' : 'FAIL',
      ok ? '米を 5kg→3kg に変更しリロード後も保持' : `表示: ${text.replace(/\n/g, ' / ')}`,
      ['S-3'],
    );
  }

  // MB-03: 賞味期限を null → 値に設定 → リロードで保持（S-3 は期限なし）
  {
    const target = new Date();
    target.setDate(target.getDate() + 2);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    await openEditDialog(page, '米');
    await page.getByRole('alertdialog').getByLabel('賞味期限').fill(iso);
    await page.getByRole('alertdialog').getByRole('button', { name: '保存' }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const text = await card(page, '米').innerText();
    const ok = text.includes('あと2日');
    record(
      'MB-03',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `米に賞味期限 ${iso} を後付けしリロード後も保持（チップ「あと2日」）`
        : `表示: ${text.replace(/\n/g, ' / ')}`,
      ['S-3'],
    );
  }

  // MB-04: 賞味期限を null にクリア → リロードで保持
  {
    await openEditDialog(page, '米');
    await page.getByRole('alertdialog').getByLabel('賞味期限').fill('');
    await page.getByRole('alertdialog').getByRole('button', { name: '保存' }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const text = await card(page, '米').innerText();
    const ok = !text.includes('あと2日') && !/〜\d+\/\d+まで/.test(text);
    record(
      'MB-04',
      ok ? 'PASS' : 'FAIL',
      ok ? '米の賞味期限をクリアしリロード後も null のまま' : `表示: ${text.replace(/\n/g, ' / ')}`,
      ['S-3'],
    );
  }

  // MB-05: 保存場所を未設定 → 値に設定 → リロードで保持（S-4 は未設定）
  {
    await openEditDialog(page, '卵');
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('保存場所').click();
    await page.getByRole('option', { name: '冷蔵' }).click();
    await dialog.getByRole('button', { name: '保存' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const ok = (await card(page, '卵').getByText('保存場所: 冷蔵').count()) > 0;
    record(
      'MB-05',
      ok ? 'PASS' : 'FAIL',
      ok
        ? '卵の保存場所を未設定→冷蔵に設定しリロード後も保持'
        : `表示: ${(await card(page, '卵').innerText()).replace(/\n/g, ' / ')}`,
      ['S-4'],
    );
  }

  // MB-06: 保存場所を「未設定」にクリア → リロードで保持
  {
    await openEditDialog(page, '卵');
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('保存場所').click();
    await page.getByRole('option', { name: '未設定' }).click();
    await dialog.getByRole('button', { name: '保存' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    const ok = (await card(page, '卵').getByText('保存場所: 保存場所未設定').count()) > 0;
    record(
      'MB-06',
      ok ? 'PASS' : 'FAIL',
      ok
        ? '卵の保存場所を未設定に戻しリロード後も保持'
        : `表示: ${(await card(page, '卵').innerText()).replace(/\n/g, ' / ')}`,
      ['S-4'],
    );
  }

  // MB-15: 数量 0 以下はクライアント側で弾かれ送信されない
  {
    await openEditDialog(page, '味噌');
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('数量').fill('0袋');
    const save = dialog.getByRole('button', { name: '保存' });
    const disabled = await save.isDisabled();
    let stillOpen = true;
    if (!disabled) {
      await save.click();
      await page.waitForTimeout(500);
      stillOpen = await dialog.isVisible();
    }
    record(
      'MB-15',
      disabled || stillOpen ? 'PASS' : 'FAIL',
      disabled
        ? '数量 0 で保存ボタンが disabled'
        : stillOpen
          ? '数量 0 で送信されずダイアログが開いたまま'
          : '数量 0 が送信されてしまった',
      ['S-6'],
    );
    await dialog
      .getByRole('button', { name: 'キャンセル' })
      .click()
      .catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }

  // MB-17: 375px 幅で /pantry のカードがレイアウトを崩さない
  {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'networkidle' });
    const doc = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    // 品目名が省略記号で切れていないか（truncate が効いて短い名前が切れるのは破綻）
    const clipped = await page.evaluate(() => {
      const out = [];
      for (const p of document.querySelectorAll('li p')) {
        if (p.scrollWidth > p.clientWidth + 1) out.push(p.textContent);
      }
      return out;
    });
    const noHScroll = doc.scrollW <= doc.clientW + 1;
    const ok = noHScroll && clipped.length === 0;
    await page.screenshot({ path: 'scripts/.verify-pantry-375.png', fullPage: true });
    record(
      'MB-17',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `375px で横スクロールなし（scrollW=${doc.scrollW} / clientW=${doc.clientW}）・テキスト切れなし。S-1〜S-7 の 7 件が並んだ状態で確認`
        : `横スクロール=${!noHScroll}(scrollW=${doc.scrollW}/clientW=${doc.clientW}) / 切れたテキスト=${JSON.stringify(clipped)}`,
      ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7'],
    );
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  // ---- 買い物完了パネル（MB-11〜14）: 未完了の買い物リストが必要 ----
  {
    await page.goto(`${BASE}/shopping-lists`, { waitUntil: 'networkidle' });
    const body = await page.locator('body').innerText();
    record(
      'MB-11..14',
      'BLOCKED',
      `買い物完了パネルには「未完了の買い物リスト（bought 品目 2 件以上）」が必要だが、dev シードに献立・買い物リストが無く到達できない（/shopping-lists の表示: ${body.slice(0, 60).replace(/\n/g, ' ')}…）。RTL の CSP-01〜06 で代替検証済み`,
    );
  }

  // MB-16: 別タブで消費/廃棄した Stock を編集すると 404 メッセージ
  {
    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await openEditDialog(page, '塩');
    // 別コンテキストから廃棄する（ダイアログは開いたまま）
    const other = await browser.newPage();
    await other.request.post(
      `${BASE}/api/pantry/stocks/77777777-7777-4777-8777-777777777777/discard`,
    );
    await other.close();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(800);
    const shown = await page.locator('body').innerText();
    const ok = shown.includes('すでに削除されています');
    record(
      'MB-16',
      ok ? 'PASS' : 'FAIL',
      ok
        ? '別経路で廃棄済みの Stock を保存すると 404 メッセージを表示'
        : `期待した 404 文言が出ない。画面: ${shown.slice(0, 160).replace(/\n/g, ' ')}`,
      ['S-7'],
    );
  }
} catch (error) {
  record('FATAL', 'FAIL', `スクリプトが例外で停止: ${error.message}`);
} finally {
  await browser.close();
}

// ---- 前提データ全消化チェック（false PASS 防止・試験計画 §10-2 手順 3） ----
const allSeeds = ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7'];
const unused = allSeeds.filter((s) => !usedSeeds.has(s));
console.log('\n===== 前提データ全消化チェック =====');
console.log(
  unused.length === 0
    ? `✓ S-1〜S-7 をすべて確認に使用した`
    : `✗ 一度も使われなかったシード: ${unused.join(', ')} — 該当する確認観点が漏れている可能性が高い`,
);

const fails = results.filter((r) => r.status === 'FAIL');
const blocked = results.filter((r) => r.status === 'BLOCKED');
console.log('\n===== summary =====');
console.log(
  `PASS: ${results.length - fails.length - blocked.length} / FAIL: ${fails.length} / BLOCKED: ${blocked.length}`,
);
process.exit(fails.length > 0 ? 1 : 0);
