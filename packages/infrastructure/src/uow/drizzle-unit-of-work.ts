import type { UnitOfWork } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';

/**
 * 1 リクエストにつき 1 インスタンス。`currentTx` をフィールドに持つのでシングルトンにしない。
 * Pool の再利用は `createDb` 側の責務。
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private currentTx: DrizzleClient | null = null;

  constructor(private readonly db: DrizzleClient) {}

  get client(): DrizzleClient {
    return this.currentTx ?? this.db;
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    if (this.currentTx !== null) {
      throw new Error('Nested UnitOfWork.execute is not supported');
    }
    return this.db.transaction(async (tx) => {
      this.currentTx = tx as unknown as DrizzleClient;
      try {
        return await work();
      } finally {
        this.currentTx = null;
      }
    });
  }
}
