import type { UnitOfWork } from '@cookpit/domain';
import type { DrizzleClient, TxConnectionProvider } from '../db/client';

export interface DrizzleUnitOfWorkOptions {
  /**
   * 対話型トランザクションで包むか。false なら `work()` をそのまま実行する。
   * neon-http は対話型トランザクション非対応なので、本番はキルスイッチで切り替える。
   * PGlite（テスト・dev）は省略時 true のまま。
   */
  useTransaction?: boolean;
  /**
   * トランザクションを開く接続の供給元。省略・null なら `db` 自身を使う。
   *
   * 本番は読み取りを neon-http、書き込みだけ neon-serverless に分けるため別を渡す
   * （設計書「トランザクション再導入」案 S）。`useTransaction` が false の間は
   * **一度も触らない** — キルスイッチを切れば WebSocket 接続を張らずに済む。
   */
  txConnectionProvider?: TxConnectionProvider | null;
}

/**
 * 1 リクエストにつき 1 インスタンス。`currentTx` をフィールドに持つのでシングルトンにしない。
 * 読み取り接続の生成は `createDb` 側の責務。
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private currentTx: DrizzleClient | null = null;
  private busy = false;
  private readonly useTransaction: boolean;
  private readonly txConnectionProvider: TxConnectionProvider | null;

  constructor(
    private readonly db: DrizzleClient,
    options: DrizzleUnitOfWorkOptions = {},
  ) {
    this.useTransaction = options.useTransaction !== false;
    this.txConnectionProvider = options.txConnectionProvider ?? null;
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
      const provider = this.txConnectionProvider;
      if (provider === null) {
        return await this.runInTransaction(this.db, work).result;
      }

      const first = this.runInTransaction(provider.acquire(), work);
      try {
        return await first.result;
      } catch (error) {
        // 使い回した接続が凍結中に切られていると begin で落ちる（設計書 H-3）。
        // work が 1 行も走っていないなら副作用はゼロなので、接続を捨てて 1 度だけやり直す。
        // work が始まった後の失敗は、COMMIT 到達済みかを判別できないため再実行しない。
        if (first.workStarted) {
          throw error;
        }
        await provider.discard();
        return await this.runInTransaction(provider.acquire(), work).result;
      }
    } finally {
      this.busy = false;
    }
  }

  /** `workStarted` は同期的に読める。`result` を await した後に判定に使う。 */
  private runInTransaction<T>(
    client: DrizzleClient,
    work: () => Promise<T>,
  ): { result: Promise<T>; workStarted: boolean } {
    const state = { started: false };
    const result = client.transaction(async (tx) => {
      state.started = true;
      this.currentTx = tx as unknown as DrizzleClient;
      try {
        return await work();
      } finally {
        this.currentTx = null;
      }
    });
    return {
      result,
      get workStarted() {
        return state.started;
      },
    };
  }
}
