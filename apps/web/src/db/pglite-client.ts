import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema, type DrizzleClient } from '@cookpit/infrastructure';

// PGlite は単一接続。dev の HMR でモジュールが再評価されても同じインスタンスを
// 使い回さないと同一 dataDir への多重オープンで壊れるため globalThis に保持する。
const globalStore = globalThis as unknown as { __cookpitPglite?: PGlite };

export function createPgliteDevDb(databaseUrl: string): DrizzleClient {
  const dataDir = databaseUrl.replace(/^pglite:\/\//, '');
  globalStore.__cookpitPglite ??= new PGlite(dataDir);
  const db = drizzle(globalStore.__cookpitPglite, { schema });
  // Repository は neon-http ドライバ由来の DrizzleClient 型を受け取るが、dev では
  // pglite ドライバを使うため型だけ合わせる（packages/infrastructure/tests/testing/
  // create-test-db.ts と同じ手法。全 Repository テストが PGlite で通過済み）。
  return db as unknown as DrizzleClient;
}
