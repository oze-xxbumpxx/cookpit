import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from '@cookpit/infrastructure';
import { createAuth } from './create-auth';

// `@better-auth/cli generate` はビルド成果物や Next.js のランタイムを経由せず直接
// このファイルを読み込むため、`server-only` を import しない（実装計画 1-1・罠 4）。
//
// 使い方（認証テーブルのスキーマを再生成したいとき。第二段でプラグインを足す場合など）:
//   pnpm dlx @better-auth/cli@1.4.21 generate \
//     --config src/server/auth/cli.config.ts \
//     --output ../../packages/infrastructure/src/db/auth-schema.ts --yes
// （apps/web ディレクトリで実行）。
//
// `@better-auth/cli@1.4.21` を workspace の devDependency として `pnpm add -D` すると、
// pnpm のピア解決が壊れ、`apps/web` の `better-auth@^1.7.5` 自身が誤った
// `@better-auth/core`（`better-call` の版違い）を掴んで `generate` が
// `SyntaxError: ... does not provide an export named 'kAPIErrorHeaderSymbol'` で失敗する
// （実装計画 Step 0-1・0-7 で実測。`@better-auth/cli` を devDependency から外し
// `pnpm dlx` の都度実行に切り替えると解消する）。そのため本リポジトリでは
// `@better-auth/cli` を devDependency に加えず、`pnpm dlx` を使う。
const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

// generate はスキーマの静的な形を導出するだけで実際に DB へ接続しないため、
// DATABASE_URL 未設定でも動くようダミー値にフォールバックする。
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/cli-generate-placeholder';

/**
 * `@better-auth/cli generate` が読み込む設定エントリ（named export `auth`）。
 * `secret`/`baseURL` は generate 時には使われないためダミー値を渡す。
 */
export const auth = createAuth({
  db: createDb(databaseUrl),
  secret: 'cli-generate-placeholder-secret',
  baseURL: null,
  trustedOrigins: [],
  allowSignUp: false,
  rateLimitStorage: 'database',
});
