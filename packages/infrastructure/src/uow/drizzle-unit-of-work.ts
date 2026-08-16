import type { UnitOfWork } from '@cookpit/domain';
import type { DrizzleClient, TxConnection } from '../db/client';

export interface DrizzleUnitOfWorkOptions {
  /**
   * 対話型トランザクションで包むか。false なら `work()` をそのまま実行する。
   * neon-http は対話型トランザクション非対応なので、本番はキルスイッチで切り替える。
   * PGlite（テスト・dev）は省略時 true のまま。
   */
  useTransaction?: boolean;
  /**
   * トランザクション 1 回分の接続を張る。省略・null なら `db` 自身を使う。
   *
   * 本番は読み取りを neon-http、書き込みだけ neon-serverless に分けるため別を渡す。
   * **`execute` のたびに呼ばれ、終わったら必ず `close()` される**（ADR-0020）。
   * `useTransaction` が false の間は**一度も呼ばれない** — キルスイッチを切れば
   * WebSocket 接続を張らずに済む。
   */
  createTxClient?: (() => Promise<TxConnection>) | null;
}

/**
 * 1 リクエストにつき 1 インスタンス。`currentTx` をフィールドに持つのでシングルトンにしない。
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private currentTx: DrizzleClient | null = null;
  private busy = false;
  private readonly useTransaction: boolean;
  private readonly createTxClient: (() => Promise<TxConnection>) | null;

  constructor(
    private readonly db: DrizzleClient,
    options: DrizzleUnitOfWorkOptions = {},
  ) {
    this.useTransaction = options.useTransaction !== false;
    this.createTxClient = options.createTxClient ?? null;
  }

  get client(): DrizzleClient {
    return this.currentTx ?? this.db;
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new Error('Nested UnitOfWork.execute is not supported');
    }
    this.busy = true;
    try {
      if (!this.useTransaction) {
        return await work();
      }
      if (this.createTxClient === null) {
        return await this.runInTransaction(this.db, work);
      }
      const connection = await this.createTxClient();
      try {
        return await this.runInTransaction(connection.db, work);
      } finally {
        await this.closeQuietly(connection);
      }
    } finally {
      this.busy = false;
    }
  }

  private async runInTransaction<T>(client: DrizzleClient, work: () => Promise<T>): Promise<T> {
    return await client.transaction(async (tx) => {
      this.currentTx = tx as unknown as DrizzleClient;
      try {
        return await work();
      } finally {
        this.currentTx = null;
      }
    });
  }

  /**
   * 切断の失敗で `work()` の例外を握り潰さないために、close の例外は再送出しない。
   * COMMIT / ROLLBACK は `runInTransaction` の中で完了済みなので、ここは後始末だけ。
   */
  private async closeQuietly(connection: TxConnection): Promise<void> {
    try {
      await connection.close();
    } catch (error) {
      // eslint-disable-next-line no-console -- 接続層にロガーが無い。握り潰しの記録は残す
      console.error(
        'failed to close tx connection',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
