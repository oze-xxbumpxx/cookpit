import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleOverWebSocket } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

/**
 * 読み取り・SSR を含む既定の接続。HTTPS 1 往復で、`db.transaction()` は使えない。
 *
 * 全経路をここに寄せるのが基本。対話型トランザクションが要る書き込みだけ
 * {@link createTxConnectionProvider} を使う（設計書「トランザクション再導入」案 S）。
 */
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;

/**
 * トランザクション用接続の供給元。接続は**使い回す**。
 *
 * サーバーレスでは使い回した接続が死んでいることがあるため、掴んだ接続が使えなかった
 * 呼び出し側が {@link discard} して {@link acquire} し直す。判定は呼び出し側の責務
 * （`DrizzleUnitOfWork` が「work が始まる前の失敗」に限って行う）。
 */
export interface TxConnectionProvider {
  /** 使い回している接続を返す。無ければ張る。 */
  acquire: () => DrizzleClient;
  /** 死んでいると判明した接続を捨てる。次の `acquire` で張り直す。 */
  discard: () => Promise<void>;
}

// discard() で undefined を代入して捨てるため、省略可能ではなく `| undefined` で持つ
// （`exactOptionalPropertyTypes: true`）。
const globalStore = globalThis as unknown as {
  __cookpitNeonPool: Pool | undefined;
  __cookpitNeonPoolUrl: string | undefined;
};

const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * 対話型トランザクション専用の接続（WebSocket）を供給する。読み取りは `createDb`
 * （neon-http）のままなので、この経路が落ちても閲覧は生き残る。
 *
 * **接続は `globalThis` で使い回す。** 買い物中のチェック操作は書き込みが連続するため、
 * 毎回張り直すと Sprint 9 で `sin1` 移設して削った往復を足し戻すことになる。
 *
 * **ただし使い回した接続は死んでいることがある。** Vercel の Function はリクエスト間で
 * 凍結され、その間に Neon が idle な WebSocket を切る。復帰後の最初の書き込みは
 * `begin` が `Connection terminated unexpectedly` で落ちる（2026-08-15 本番実測・設計書 H-3）。
 * `connectionTimeoutMillis` は Pool から見て「接続は在る」ため発火しない。
 * これは {@link TxConnectionProvider.discard} → 再 `acquire` で回復する。
 *
 * @param databaseUrl 接続文字列。前回と異なる値なら旧 Pool を閉じてから張り替える
 */
export function createTxConnectionProvider(databaseUrl: string): TxConnectionProvider {
  return {
    acquire: () => {
      // グローバル設定の書き換えは、キルスイッチが有効でここが呼ばれたときだけ行う。
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
    },

    discard: async () => {
      const pool = globalStore.__cookpitNeonPool;
      globalStore.__cookpitNeonPool = undefined;
      globalStore.__cookpitNeonPoolUrl = undefined;
      if (pool !== undefined) {
        // 既に切れている Pool の end() は失敗し得る。捨てるのが目的なので握り潰す。
        await pool.end().catch(() => undefined);
      }
    },
  };
}
