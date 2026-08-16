import {
  createDb as createInfrastructureDb,
  createTxConnection as createInfrastructureTxConnection,
  type DrizzleClient,
  type TxConnection,
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
 * トランザクション 1 回分の接続を張る。書き込み経路だけが呼ぶ。
 *
 * Neon は毎回 WebSocket 接続を張り、`close()` で閉じる（ADR-0020。使い回さない）。
 * PGlite（dev）は `getDb()` と同じインスタンスを返し、`close` は no-op —
 * 単一プロセス上の接続で、既に `db.transaction()` が使えるため分ける理由がなく、
 * 閉じると以降の読み取りまで壊れる。
 *
 * @throws Error DATABASE_URL が未設定
 */
export function getTxConnection(): Promise<TxConnection> {
  if (databaseUrl === null) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (databaseUrl.startsWith('pglite:')) {
    return Promise.resolve({ db: getDb(), close: () => Promise.resolve() });
  }
  return createInfrastructureTxConnection(databaseUrl);
}
