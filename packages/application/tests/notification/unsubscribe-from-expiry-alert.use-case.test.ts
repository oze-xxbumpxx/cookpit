import { PushSubscription } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnsubscribeFromExpiryAlertUseCase } from '../../src/notification/unsubscribe-from-expiry-alert.use-case';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private subscriptions: PushSubscription[] = [];
  public deleteByEndpointCalls: string[] = [];

  async findAll(): Promise<PushSubscription[]> {
    return [...this.subscriptions];
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    return this.subscriptions.find((s) => s.endpoint === endpoint) ?? null;
  }

  async save(subscription: PushSubscription): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
    this.subscriptions.push(subscription);
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    this.deleteByEndpointCalls.push(endpoint);
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => !endpoints.includes(s.endpoint));
  }

  seed(subscription: PushSubscription): void {
    this.subscriptions.push(subscription);
  }
}

let repository: InMemoryPushSubscriptionRepository;

beforeEach(() => {
  repository = new InMemoryPushSubscriptionRepository();
});

describe('UnsubscribeFromExpiryAlertUseCase', () => {
  it('UNSUB-01: 登録済み endpoint を削除する', async () => {
    repository.seed(
      PushSubscription.create({ endpoint: 'https://example.com/a', p256dh: 'p', auth: 'a' }),
    );

    await new UnsubscribeFromExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
      endpoint: 'https://example.com/a',
    });

    expect(await repository.findByEndpoint('https://example.com/a')).toBeNull();
    expect(repository.deleteByEndpointCalls).toEqual(['https://example.com/a']);
  });

  it('UNSUB-02: 存在しない endpoint を解除しても例外を投げない（冪等）', async () => {
    await expect(
      new UnsubscribeFromExpiryAlertUseCase(repository, passthroughUnitOfWork).execute({
        endpoint: 'https://example.com/not-registered',
      }),
    ).resolves.toBeUndefined();
  });
});
