import { test, expect } from '@playwright/test';

// CI では E2E_AUTH_EMAIL/E2E_AUTH_PASSWORD を設定しないため必ず skip される
// （F-10/D-15。既存2本は NODE_ENV=development の認証スキップ経路で無変更のまま通る）。
// ローカル/Preview で実行する場合は事前に対象環境へ auth:create-user でアカウントを
// 発行しておくこと（apps/web/e2e/README.md 参照）。
const email = process.env.E2E_AUTH_EMAIL;
const password = process.env.E2E_AUTH_PASSWORD;

test.describe('ログイン（E2E_AUTH_EMAIL/E2E_AUTH_PASSWORD 設定時のみ実行）', () => {
  test.skip(email === undefined || password === undefined, 'E2E_AUTH_EMAIL/PASSWORD 未設定');

  test('未認証で保護パスへ直接アクセス→ログイン→ログアウトの一連が成功する', async ({ page }) => {
    await page.goto('/pantry');
    await expect(page).toHaveURL(/\/login\?next=%2Fpantry/);

    await page.getByLabel('メールアドレス').fill(email as string);
    await page.getByLabel('パスワード').fill(password as string);
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page).toHaveURL(/\/pantry$/);

    await page.goto('/more');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/pantry');
    await expect(page).toHaveURL(/\/login\?next=%2Fpantry/);
  });
});
