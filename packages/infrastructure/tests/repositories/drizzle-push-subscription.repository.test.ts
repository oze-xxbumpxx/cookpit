import { beforeEach, describe, expect, it } from 'vitest';
import { PushSubscription, PushSubscriptionId } from '@cookpit/domain';
import type { DrizzleClient } from '../../src/db/client';
import { pushSubscriptions } from '../../src/db/schema';
import { createTestDb } from '../testing/create-test-db';
import { DrizzlePushSubscriptionRepository } from '../../src/repositories/drizzle-push-subscription.repository';

function reconstructSubscription(
  overrides: {
    id?: string;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    createdAt?: Date;
  } = {},
): PushSubscription {
  return PushSubscription.reconstruct({
    id: PushSubscriptionId.fromString(overrides.id ?? 'push-subscription-1'),
    endpoint: overrides.endpoint ?? 'https://fcm.googleapis.com/fcm/send/x',
    p256dh: overrides.p256dh ?? 'p256dh-value',
    auth: overrides.auth ?? 'auth-value',
    createdAt: overrides.createdAt ?? new Date('2026-08-01T00:00:00.000Z'),
  });
}

describe('DrizzlePushSubscriptionRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzlePushSubscriptionRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzlePushSubscriptionRepository(db);
  });

  it('空 DB での findAll() は空配列を返す (INF-PUSH-空)', async () => {
    expect(await repository.findAll()).toEqual([]);
  });

  it('save() した新規購読を findAll() で復元できる (INF-PUSH-01)', async () => {
    const subscription = reconstructSubscription();

    await repository.save(subscription);
    const all = await repository.findAll();

    expect(all).toHaveLength(1);
    expect(all[0]?.id.equals(subscription.id)).toBe(true);
    expect(all[0]?.endpoint).toBe(subscription.endpoint);
    expect(all[0]?.p256dh).toBe(subscription.p256dh);
    expect(all[0]?.auth).toBe(subscription.auth);
    expect(all[0]?.createdAt.getTime()).toBe(subscription.createdAt.getTime());
  });

  it('同一 endpoint への再 save() は行を増やさず鍵を更新する（upsert） (INF-PUSH-02・最重要)', async () => {
    const first = reconstructSubscription({ p256dh: 'old-p256dh', auth: 'old-auth' });
    await repository.save(first);

    const second = PushSubscription.reconstruct({
      id: first.id,
      endpoint: first.endpoint,
      p256dh: 'new-p256dh',
      auth: 'new-auth',
      createdAt: first.createdAt,
    });
    await repository.save(second);

    expect(await repository.findAll()).toHaveLength(1);
    const found = await repository.findByEndpoint(first.endpoint);
    expect(found?.p256dh).toBe('new-p256dh');
    expect(found?.auth).toBe('new-auth');
  });

  it('findByEndpoint() は存在しない endpoint には null を返す (INF-PUSH-03)', async () => {
    expect(await repository.findByEndpoint('https://not-registered.example/x')).toBeNull();
  });

  it('deleteByEndpoint() は存在しない endpoint でも例外を投げない（冪等） (INF-PUSH-04)', async () => {
    await expect(
      repository.deleteByEndpoint('https://not-registered.example/x'),
    ).resolves.toBeUndefined();
  });

  it('deleteByEndpoint() は対象の行のみ削除する (INF-PUSH-05)', async () => {
    const target = reconstructSubscription({
      id: 'target',
      endpoint: 'https://fcm.googleapis.com/fcm/send/target',
    });
    const kept = reconstructSubscription({
      id: 'kept',
      endpoint: 'https://fcm.googleapis.com/fcm/send/kept',
    });
    await repository.save(target);
    await repository.save(kept);

    await repository.deleteByEndpoint(target.endpoint);

    const all = await repository.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.endpoint).toBe(kept.endpoint);
  });

  it('deleteByEndpoints() は複数件を 1 回でまとめて削除する (INF-PUSH-06)', async () => {
    const subscriptions = [1, 2, 3, 4, 5].map((n) =>
      reconstructSubscription({
        id: `push-subscription-${n}`,
        endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
      }),
    );
    for (const subscription of subscriptions) {
      await repository.save(subscription);
    }

    await repository.deleteByEndpoints([
      subscriptions[0]?.endpoint ?? '',
      subscriptions[1]?.endpoint ?? '',
      subscriptions[2]?.endpoint ?? '',
    ]);

    const remaining = await repository.findAll();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((s) => s.endpoint).sort()).toEqual(
      [subscriptions[3]?.endpoint, subscriptions[4]?.endpoint].sort(),
    );
  });

  it('deleteByEndpoints([]) は何も削除しない (INF-PUSH-07)', async () => {
    await repository.save(reconstructSubscription());

    await repository.deleteByEndpoints([]);

    expect(await repository.findAll()).toHaveLength(1);
  });

  it('endpoint の UNIQUE 制約が直接 INSERT の重複を拒否する (INF-PUSH-08)', async () => {
    await db.insert(pushSubscriptions).values({
      id: 'row-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/dup',
      p256dh: 'p256dh-1',
      auth: 'auth-1',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    await expect(
      db.insert(pushSubscriptions).values({
        id: 'row-2',
        endpoint: 'https://fcm.googleapis.com/fcm/send/dup',
        p256dh: 'p256dh-2',
        auth: 'auth-2',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow();
  });
});
