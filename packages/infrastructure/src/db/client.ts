import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleOverWebSocket } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

/**
 * 読み取り・SSR を含む既定の接続。HTTPS 1 往復で、`db.transaction()` は使えない。
 *
 * 全経路をここに寄せるのが基本。対話型トランザクションが要る書き込みだけ
 * {@link createTxConnection} を使う（設計書「トランザクション再導入」案 S）。
 */
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;

/** 使い終わったら必ず {@link TxConnection.close} を呼ぶ。呼ばないとソケットが残る。 */
export interface TxConnection {
  client: DrizzleClient;
  close: () => Promise<void>;
}

const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * 対話型トランザクション専用の接続（WebSocket）。**1 トランザクションにつき 1 本張り、
 * 終わったら閉じる。**
 *
 * 接続を使い回さないのは、サーバーレスでは使い回せないため。Vercel の Function は
 * リクエスト間で凍結され、その間に Neon 側が idle な WebSocket を切る。Pool を
 * `globalThis` に載せて再利用すると、次の書き込みで**死んだソケットを掴み**、
 * 最初の `begin` が `Connection terminated unexpectedly` で落ちる
 * （2026-08-15 本番実測。設計書 H-3）。`connectionTimeoutMillis` は Pool から見て
 * 「接続は在る」ため発火しない。
 *
 * 代償は書き込み 1 回ごとの接続確立（WS ハンドシェイク + 認証）。読み取りは
 * `createDb`（neon-http）のままなので、この経路が落ちても閲覧は生き残る。
 *
 * @param databaseUrl 接続文字列
 */
export function createTxConnection(databaseUrl: string): TxConnection {
  // グローバル設定の書き換えは、キルスイッチが有効でこの関数が呼ばれたときだけ行う。
  neonConfig.webSocketConstructor = WebSocket;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  pool.on('error', (err: Error) => {
    // eslint-disable-next-line no-console -- 接続層にロガーが無く、未捕捉例外を防ぐには listener が必要
    console.error('neon pool error', err.message);
  });

  // neon-http と neon-serverless で drizzle の型が異なる。Repository が使う API は同じ
  // （設計書 R-4 の PGlite と同じ扱い）。
  const client = drizzleOverWebSocket(pool, { schema }) as unknown as DrizzleClient;

  return {
    client,
    close: async () => {
      // 後始末の失敗で本体の結果を潰さない。接続は Function 終了時にどのみち回収される。
      await pool.end().catch(() => undefined);
    },
  };
}
