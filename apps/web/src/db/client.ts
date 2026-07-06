import { createDb as createInfrastructureDb, type DrizzleClient } from '@cookpit/infrastructure';

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
