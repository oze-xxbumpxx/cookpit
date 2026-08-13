import { PushSubscription } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidOperationError } from '../../src/shared/errors';
import {
  MAX_SUBSCRIPTION_COUNT,
  SubscribeToExpiryAlertUseCase,
} from '../../src/notification/subscribe-to-expiry-alert.use-case';
import { TooManySubscriptionsError } from '../../src/notification/too-many-subscriptions.error';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private subscriptions: PushSubscription[] = [];
  public saveCalls: PushSubscription[] = [];

  async findAll(): Promise<PushSubscription[]> {
    return [...this.subscriptions];
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    return this.subscriptions.find((s) => s.endpoint === endpoint) ?? null;
  }

  async save(subscription: PushSubscription): Promise<void> {
    this.saveCalls.push(subscription);
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
    this.subscriptions.push(subscription);
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => !endpoints.includes(s.endpoint));
  }

  seed(subscription: PushSubscription): void {
    this.subscriptions.push(subscription);
  }

  seedMany(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.subscriptions.push(
        PushSubscription.create({
          endpoint: `https://example.com/existing-${i}`,
          p256dh: 'p256dh-value',
          auth: 'auth-value',
        }),
      );
    }
  }
}

let repository: InMemoryPushSubscriptionRepository;

beforeEach(() => {
  repository = new InMemoryPushSubscriptionRepository();
});

describe('SubscribeToExpiryAlertUseCase', () => {
  it('SUB-01: 新規 endpoint を登録する', async () => {
    await new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
      endpoint: 'https://example.com/new',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    });

    expect(repository.saveCalls).toHaveLength(1);
    const saved = repository.saveCalls[0];
    expect(saved?.endpoint).toBe('https://example.com/new');
  });

  it('SUB-02: 既存 endpoint の再購読は upsert（id を保持したまま鍵が更新される）', async () => {
    const existing = PushSubscription.create({
      endpoint: 'https://example.com/a',
      p256dh: 'old-p256dh',
      auth: 'old-auth',
    });
    repository.seed(existing);

    await new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
      endpoint: 'https://example.com/a',
      p256dh: 'new-p256dh',
      auth: 'new-auth',
    });

    const all = await repository.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id.value).toBe(existing.id.value);
    expect(all[0]?.p256dh).toBe('new-p256dh');
    expect(all[0]?.auth).toBe('new-auth');
  });

  it('SUB-03: 空文字入力は Domain の検証（Error）が UseCase を素通りして伝搬する', async () => {
    await expect(
      new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
        endpoint: '',
        p256dh: 'x',
        auth: 'y',
      }),
    ).rejects.toThrow();
    expect(repository.saveCalls).toHaveLength(0);
  });

  it('SUB-04: 同一 endpoint・同一 keys の再送は完全に無害', async () => {
    const useCase = new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork);
    const input = {
      endpoint: 'https://example.com/a',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    };

    await useCase.execute(input);
    await useCase.execute(input);

    expect(await repository.findAll()).toHaveLength(1);
  });

  it('SUB-05: 再購読しても createdAt は初回登録時の値のまま', async () => {
    const existing = PushSubscription.create({
      endpoint: 'https://example.com/a',
      p256dh: 'old-p256dh',
      auth: 'old-auth',
    });
    repository.seed(existing);

    await new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
      endpoint: 'https://example.com/a',
      p256dh: 'new-p256dh',
      auth: 'new-auth',
    });

    const [saved] = await repository.findAll();
    expect(saved?.createdAt.getTime()).toBe(existing.createdAt.getTime());
  });

  it('SUB-06: 上限直前（9 件）で新規購読は成功する（境界）', async () => {
    repository.seedMany(MAX_SUBSCRIPTION_COUNT - 1);

    await expect(
      new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
        endpoint: 'https://example.com/tenth',
        p256dh: 'p256dh-value',
        auth: 'auth-value',
      }),
    ).resolves.toBeUndefined();
    expect(await repository.findAll()).toHaveLength(MAX_SUBSCRIPTION_COUNT);
  });

  it('SUB-07: 上限到達（10 件）で新規購読は TooManySubscriptionsError（InvalidOperationError）を投げる（境界）', async () => {
    repository.seedMany(MAX_SUBSCRIPTION_COUNT);

    await expect(
      new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
        endpoint: 'https://example.com/eleventh',
        p256dh: 'p256dh-value',
        auth: 'auth-value',
      }),
    ).rejects.toBeInstanceOf(TooManySubscriptionsError);
    expect(repository.saveCalls).toHaveLength(0);
    expect(await repository.findAll()).toHaveLength(MAX_SUBSCRIPTION_COUNT);
  });

  it('SUB-07b: TooManySubscriptionsError は InvalidOperationError を継承する（ルート層で 422 になる）', () => {
    const error = new TooManySubscriptionsError(MAX_SUBSCRIPTION_COUNT);
    expect(error).toBeInstanceOf(InvalidOperationError);
  });

  it('SUB-08: 上限到達（10 件）でも既存 endpoint の再登録は成功する（回帰ガード）', async () => {
    repository.seedMany(MAX_SUBSCRIPTION_COUNT - 1);
    const target = PushSubscription.create({
      endpoint: 'https://example.com/target',
      p256dh: 'old-p256dh',
      auth: 'old-auth',
    });
    repository.seed(target);
    expect(await repository.findAll()).toHaveLength(MAX_SUBSCRIPTION_COUNT);

    await expect(
      new SubscribeToExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
        endpoint: 'https://example.com/target',
        p256dh: 'rotated-p256dh',
        auth: 'rotated-auth',
      }),
    ).resolves.toBeUndefined();

    const all = await repository.findAll();
    expect(all).toHaveLength(MAX_SUBSCRIPTION_COUNT);
    const updated = await repository.findByEndpoint('https://example.com/target');
    expect(updated?.p256dh).toBe('rotated-p256dh');
    expect(updated?.auth).toBe('rotated-auth');
  });
});
