import { defineConfig, devices } from '@playwright/test';

// E2E スモーク設定。
// - 実行（緑判定）はアプリ + DB が必要なため、原則ローカルで `pnpm e2e` を回す。
// - baseURL は既定で localhost:3000。`E2E_BASE_URL` で上書き可。
// - webServer は未起動なら `pnpm dev` を自動起動する（既に起動済みなら再利用）。
//   ローカルでは `.env`（DATABASE_URL）が必要。
// - ブラウザがプリインストール済みの環境では `PLAYWRIGHT_CHROMIUM_EXECUTABLE` で実体を指定できる
//   （未設定ならローカルの Playwright が自前で用意したブラウザを使う）。
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
