import { eq, inArray } from 'drizzle-orm';
import { PushSubscription, PushSubscriptionId } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';
import { pushSubscriptions, type PushSubscriptionRow } from '../db/schema';
import type { DrizzleUnitOfWork } from '../uow/drizzle-unit-of-work';

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly unitOfWork: DrizzleUnitOfWork) {}

  private get db(): DrizzleClient {
    return this.unitOfWork.client;
  }

  async findAll(): Promise<PushSubscription[]> {
    const rows = await this.db.select().from(pushSubscriptions);
    return rows.map((row) => this.toEntity(row));
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    const [row] = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    return row === undefined ? null : this.toEntity(row);
  }

  async save(subscription: PushSubscription): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        id: subscription.id.value,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        createdAt: subscription.createdAt,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: subscription.p256dh, auth: subscription.auth },
      });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
  }

  private toEntity(row: PushSubscriptionRow): PushSubscription {
    return PushSubscription.reconstruct({
      id: PushSubscriptionId.fromString(row.id),
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.createdAt,
    });
  }
}
