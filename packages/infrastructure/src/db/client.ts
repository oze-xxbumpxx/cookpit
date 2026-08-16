import { neon, Client, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleOverWebSocket } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

/**
 * 読み取り・SSR を含む既定の接続。HTTPS 1 往復で、`db.transaction()` は使えない。
 *
 * 全経路をここに寄せるのが基本。対話型トランザクションが要る書き込みだけ
 * {@link createTxConnection} を使う（設計書「接続の寿命 — 1 リクエスト 1 接続へ」）。
 */
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;

/**
 * トランザクション 1 回分の接続。**使い終わったら必ず `close()` を await すること。**
 *
 * 閉じ忘れるとソケットがリクエストより長生きし、ADR-0020 の障害が再発する。
 * 呼び出し側で握らずに済むよう、`DrizzleUnitOfWork.execute` が `finally` で閉じる。
 */
export interface TxConnection {
  db: DrizzleClient;
  close: () => Promise<void>;
}

/** ハンドシェイクが詰まったままリクエストを占有させないための上限。 */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * 対話型トランザクション専用の接続（WebSocket）。書き込み経路だけが使う。
 *
 * **1 リクエスト 1 接続。使い回さない**（ADR-0020）。2026-08-16 に `globalThis` へ
 * `Pool` を保持したところ、ソケットがリクエストより長生きし、FaaS のインスタンス凍結中に
 * 死んだ。その死亡イベントが無関係なリクエストの処理中に飛んで巻き添えで落ちていた。
 * 接続の寿命をリクエストに揃えると、この失敗モードが構造的に消える。
 *
 * `Pool`（`max: 1`）ではなく `Client` を使うのは、1 回使って捨てる用途に対して
 * Pool の待ち行列とアイドル管理が不要なため。
 *
 * `neonConfig` の書き換えを module スコープではなくここで行うのは、キルスイッチが
 * 無効な間はグローバル設定に一切触れないため。
 *
 * @param databaseUrl 接続文字列
 * @throws Error 接続に失敗した場合（`CONNECTION_TIMEOUT_MS` 超過を含む）
 */
export async function createTxConnection(databaseUrl: string): Promise<TxConnection> {
  neonConfig.webSocketConstructor = WebSocket;

  const client = new Client({
    connectionString: databaseUrl,
    // Pool のときは「接続の取得待ち」にしか効かず握り潰されていた（ADR-0019 実行記録の
    // 15 秒）。Client では接続確立そのものに効く。
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  // listener が無いと、クエリ外でソケットが死んだときの 'error' が未捕捉例外になり
  // プロセスごと落ちる。実行中のクエリは _errorAllQueries 経由で個別に reject されるので、
  // ここで握り潰しても UseCase 側のエラーは失われない。
  client.on('error', (err: Error) => {
    // eslint-disable-next-line no-console -- 接続層にロガーが無く、未捕捉例外を防ぐには listener が必要
    console.error('neon tx client error', err.message);
  });

  await client.connect();

  return {
    // neon-http と neon-serverless で drizzle の型が異なる。Repository が使う API は同じ
    // （設計書 R-4 の PGlite と同じ扱い）。
    db: drizzleOverWebSocket(client, { schema }) as unknown as DrizzleClient,
    close: async () => {
      await client.end();
    },
  };
}
