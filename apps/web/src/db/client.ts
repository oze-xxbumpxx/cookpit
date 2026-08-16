import {
  createDb as createInfrastructureDb,
  createTxConnectionProvider as createInfrastructureTxConnectionProvider,
  type DrizzleClient,
  type TxConnectionProvider,
} from '@cookpit/infrastructure';

export function createDb(databaseUrl: string): DrizzleClient {
  return createInfrastructureDb(databaseUrl);
}
const databaseUrl = process.env.DATABASE_URL ?? null;

// dev 専用: DATABASE_URL が pglite:// のときはファイルバック PGlite に接続する
// （リモート環境の実画面確認用。scripts/setup-pglite-dev.mjs が事前にマイグレーションと
// シードを済ませる）。NODE_ENV は Next がビルド時に静的置換するため、本番ビルドでは
// この分岐ごと dead code として除去され、Neon 経路に影響しない。
let resolvedDb: DrizzleClient | null = null;
if (databaseUrl !== null) {
  if (databaseUrl.startsWith('pglite:')) {
    if (process.env.NODE_ENV !== 'production') {
      const { createPgliteDevDb } = await import('./pglite-client');
      resolvedDb = createPgliteDevDb(databaseUrl);
    }
  } else {
    resolvedDb = createDb(databaseUrl);
  }
}

export const db: DrizzleClient | null = resolvedDb;

export function getDb(): DrizzleClient {
  if (db === null) {
    throw new Error('DATABASE_URL is not configured');
  }
  return db;
}

/**
 * 対話型トランザクション用の接続供給元を返す。書き込み経路だけが使う。
 *
 * PGlite（dev）は `getDb()` を返し `discard()` は何もしない（単一プロセス上の接続で、
 * 既に `db.transaction()` が使えるため分ける理由がない）。Neon は WebSocket 接続を
 * 使い回し、死んでいたときだけ張り直す。
 *
 * @throws Error DATABASE_URL が未設定
 */
export function txConnectionProvider(): TxConnectionProvider {
  if (databaseUrl === null) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (databaseUrl.startsWith('pglite:')) {
    return { acquire: () => getDb(), discard: async () => undefined };
  }
  return createInfrastructureTxConnectionProvider(databaseUrl);
}
