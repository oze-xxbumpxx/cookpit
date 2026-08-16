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
   * トランザクションを開く接続の生成。省略・null なら `db` 自身を使う。
   *
   * 本番は読み取りを neon-http、書き込みだけ neon-serverless に分けるため別を渡す
   * （設計書「トランザクション再導入」案 S）。`useTransaction` が false の間は
   * **一度も呼ばれない** — キルスイッチを切れば WebSocket 接続を張らずに済む。
   *
   * **`execute` ごとに 1 本張り、成否によらず閉じる。** 接続の使い回しはしない
   * （サーバーレスでは凍結中に Neon 側から切られ、次回に死んだソケットを掴む。設計書 H-3）。
   */
  createTxConnection?: (() => TxConnection) | null;
}

/**
 * 1 リクエストにつき 1 インスタンス。`currentTx` をフィールドに持つのでシングルトンにしない。
 * 読み取り接続の生成は `createDb` 側の責務。
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private currentTx: DrizzleClient | null = null;
  private busy = false;
  private readonly useTransaction: boolean;
  private readonly createTxConnection: (() => TxConnection) | null;

  constructor(
    private readonly db: DrizzleClient,
    options: DrizzleUnitOfWorkOptions = {},
  ) {
    this.useTransaction = options.useTransaction !== false;
    this.createTxConnection = options.createTxConnection ?? null;
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
      const connection = this.createTxConnection === null ? null : this.createTxConnection();
      const txClient = connection === null ? this.db : connection.client;
      try {
        return await txClient.transaction(async (tx) => {
          this.currentTx = tx as unknown as DrizzleClient;
          try {
            return await work();
          } finally {
            this.currentTx = null;
          }
        });
      } finally {
        if (connection !== null) {
          await connection.close();
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
