import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleOverWebSocket } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

/**
 * 読み取り・SSR を含む既定の接続。HTTPS 1 往復で、`db.transaction()` は使えない。
 *
 * 全経路をここに寄せるのが基本。対話型トランザクションが要る書き込みだけ
 * {@link createTxDb} を使う（ADR-0019 実行記録・設計書「トランザクション再導入の設計案」案 S）。
 */
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;

const globalStore = globalThis as unknown as {
  __cookpitNeonPool?: Pool;
  __cookpitNeonPoolUrl?: string;
};

const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * 対話型トランザクション専用の接続（WebSocket `Pool`）。書き込み経路だけが使う。
 *
 * 読み取りと分けているのは影響範囲の限定が目的。2026-08-13 に全経路を WebSocket へ
 * 寄せたところ Vercel から Neon へ接続できず、読み取りまで巻き添えで落ちて全画面が
 * クラッシュした（ADR-0019 実行記録）。分けておけば同じ障害が起きても閲覧は生き残る。
 *
 * Pool は `globalThis` で使い回す。`neonConfig` の書き換えを module スコープではなく
 * ここで行うのは、キルスイッチが無効な間はグローバル設定に一切触れないため。
 *
 * @param databaseUrl 接続文字列。前回と異なる値なら旧 Pool を閉じてから張り替える
 */
export function createTxDb(databaseUrl: string): DrizzleClient {
  neonConfig.webSocketConstructor = WebSocket;

  if (
    globalStore.__cookpitNeonPool === undefined ||
    globalStore.__cookpitNeonPoolUrl !== databaseUrl
  ) {
    const previous = globalStore.__cookpitNeonPool;
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
    pool.on('error', (err: Error) => {
      // eslint-disable-next-line no-console -- 接続層にロガーが無く、未捕捉例外を防ぐには listener が必要
      console.error('neon pool error', err.message);
    });
    globalStore.__cookpitNeonPool = pool;
    globalStore.__cookpitNeonPoolUrl = databaseUrl;
    if (previous !== undefined) {
      void previous.end().catch(() => undefined);
    }
  }

  // neon-http と neon-serverless で drizzle の型が異なる。Repository が使う API は同じ
  // （設計書 R-4 の PGlite と同じ扱い）。
  return drizzleOverWebSocket(globalStore.__cookpitNeonPool, {
    schema,
  }) as unknown as DrizzleClient;
}
