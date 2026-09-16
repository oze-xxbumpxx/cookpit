import { defineConfig, devices } from '@playwright/test';

// E2E スモーク設定。
// - ローカルでは Neon または PGlite、CI では DATABASE_URL secret の有無に応じて Neon / PGlite で実行する。
// - baseURL は既定で localhost:3000。`E2E_BASE_URL` で上書き可。
// - webServer は未起動なら `pnpm dev` を自動起動する（既に起動済みなら再利用）。
//   ローカルでは `.env` の DATABASE_URL、または `pglite://.pglite-dev` を使用できる。
// - ブラウザがプリインストール済みの環境では `PLAYWRIGHT_CHROMIUM_EXECUTABLE` で実体を指定できる
//   （未設定ならローカルの Playwright が自前で用意したブラウザを使う）。
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const usesPGlite = process.env.DATABASE_URL?.startsWith('pglite://') ?? false;
// `src/proxy.ts` の Basic 認証は環境変数が設定されていれば `pnpm dev` でも掛かる
// （NODE_ENV でスキップされるのは未設定時のみ）。`.env` に値を入れた開発者や、Preview URL を
// `E2E_BASE_URL` に向けた実行で全テストが 401 にならないよう、同じ変数から資格情報を渡す。
const basicAuthUser = process.env.BASIC_AUTH_USER;
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;
const httpCredentials =
  basicAuthUser !== undefined &&
  basicAuthUser !== '' &&
  basicAuthPassword !== undefined &&
  basicAuthPassword !== ''
    ? { username: basicAuthUser, password: basicAuthPassword }
    : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // ファイル DB を複数 worker から同時に開くと PGlite の WASM ランタイムが競合するため直列化する。
  workers: usesPGlite ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...(httpCredentials !== undefined ? { httpCredentials } : {}),
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
