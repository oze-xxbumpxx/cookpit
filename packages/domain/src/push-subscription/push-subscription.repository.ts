import type { PushSubscription } from './push-subscription';

export interface PushSubscriptionRepository {
  findAll(): Promise<PushSubscription[]>;
  findByEndpoint(endpoint: string): Promise<PushSubscription | null>;
  /** endpoint が既存なら鍵を更新（upsert）。新規なら追加する（P-8）。 */
  save(subscription: PushSubscription): Promise<void>;
  /** 存在しなくても例外を投げない（冪等）。 */
  deleteByEndpoint(endpoint: string): Promise<void>;
  /** Cron の一括失効削除用（N+1 回避）。 */
  deleteByEndpoints(endpoints: string[]): Promise<void>;
}
