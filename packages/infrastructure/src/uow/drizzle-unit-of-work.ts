import type { UnitOfWork } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';

export interface DrizzleUnitOfWorkOptions {
  /**
   * neon-http は対話型トランザクション非対応。本番は false。
   * PGlite（テスト・dev）は省略時 true のまま。
   */
  useTransaction?: boolean;
}

/**
 * 1 リクエストにつき 1 インスタンス。`currentTx` をフィールドに持つのでシングルトンにしない。
 * 接続の再利用は `createDb` 側の責務。
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private currentTx: DrizzleClient | null = null;
  private busy = false;
  private readonly useTransaction: boolean;

  constructor(
    private readonly db: DrizzleClient,
    options: DrizzleUnitOfWorkOptions = {},
  ) {
    this.useTransaction = options.useTransaction !== false;
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
      return await this.db.transaction(async (tx) => {
        this.currentTx = tx as unknown as DrizzleClient;
        try {
          return await work();
        } finally {
          this.currentTx = null;
        }
      });
    } finally {
      this.busy = false;
    }
  }
}
