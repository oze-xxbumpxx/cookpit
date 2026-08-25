import { PushSubscription } from '@cookpit/domain';
import type {
  Pantry,
  PantryRepository,
  PushPayload,
  PushSendResult,
  PushSender,
  PushSubscriptionRepository,
  PushSubscriptionTarget,
} from '@cookpit/domain';
import { Pantry as PantryEntity } from '@cookpit/domain';
import { describe, expect, it } from 'vitest';
import { GetExpiringStocksUseCase } from '../../src/pantry/get-expiring-stocks.use-case';
import type { StockDto } from '../../src/pantry/pantry.dto';
import { SendExpiryAlertsUseCase } from '../../src/notification/send-expiry-alerts.use-case';

class DummyPantryRepository implements PantryRepository {
  async find(): Promise<Pantry> {
    return PantryEntity.create();
  }

  async save(): Promise<void> {
    // no-op: this fake is only used to satisfy GetExpiringStocksUseCase's constructor.
  }
}

class FakeGetExpiringStocksUseCase extends GetExpiringStocksUseCase {
  constructor(private readonly stocksToReturn: StockDto[]) {
    super(new DummyPantryRepository());
  }

  override async execute(): Promise<StockDto[]> {
    return this.stocksToReturn;
  }
}

class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private subscriptions: PushSubscription[];
  public deleteByEndpointsCalls: string[][] = [];

  constructor(subscriptions: PushSubscription[] = []) {
    this.subscriptions = subscriptions;
  }

  async findAll(): Promise<PushSubscription[]> {
    return [...this.subscriptions];
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    return this.subscriptions.find((s) => s.endpoint === endpoint) ?? null;
  }

  async save(subscription: PushSubscription): Promise<void> {
    this.subscriptions.push(subscription);
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    this.deleteByEndpointsCalls.push(endpoints);
    this.subscriptions = this.subscriptions.filter((s) => !endpoints.includes(s.endpoint));
  }
}

class MockPushSender implements PushSender {
  public sentTo: PushSubscriptionTarget[] = [];
  public payloads: PushPayload[] = [];

  constructor(
    private readonly resultByEndpoint: Map<string, PushSendResult | 'reject'> = new Map(),
  ) {}

  async send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<PushSendResult> {
    this.sentTo.push(subscription);
    this.payloads.push(payload);
    const result = this.resultByEndpoint.get(subscription.endpoint);
    if (result === 'reject') {
      throw new Error('network error');
    }
    return result ?? { ok: true };
  }
}

function subscription(endpoint: string): PushSubscription {
  return PushSubscription.create({ endpoint, p256dh: 'p256dh-value', auth: 'auth-value' });
}

function stockDto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: overrides.id ?? 'stock-1',
    productId: overrides.productId ?? null,
    displayName: overrides.displayName ?? '牛乳',
    amount: overrides.amount ?? { value: 1, unit: '本' },
    purchasedAt: overrides.purchasedAt ?? '2026-07-18T00:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-07-22',
    storedLocation: overrides.storedLocation ?? 'fridge',
  };
}

const asOf = new Date('2026-07-21T09:00:00');

describe('SendExpiryAlertsUseCase', () => {
  it('SEA-01: 購読 0 件で早期終了する', async () => {
    const pushSender = new MockPushSender();
    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      new InMemoryPushSubscriptionRepository([]),
      pushSender,
    ).execute(asOf);

    expect(result).toEqual({
      subscriptionCount: 0,
      sentCount: 0,
      removedCount: 0,
      expiringStockCount: 0,
    });
    expect(pushSender.sentTo).toHaveLength(0);
  });

  it('SEA-02: 購読はあるが期限が近い在庫が 0 件', async () => {
    const pushSender = new MockPushSender();
    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([]),
      new InMemoryPushSubscriptionRepository([subscription('https://example.com/a')]),
      pushSender,
    ).execute(asOf);

    expect(result).toEqual({
      subscriptionCount: 1,
      sentCount: 0,
      removedCount: 0,
      expiringStockCount: 0,
    });
    expect(pushSender.sentTo).toHaveLength(0);
  });

  it('SEA-03: 全件成功', async () => {
    const pushSender = new MockPushSender();
    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      new InMemoryPushSubscriptionRepository([
        subscription('https://example.com/a'),
        subscription('https://example.com/b'),
      ]),
      pushSender,
    ).execute(asOf);

    expect(result.sentCount).toBe(2);
    expect(result.removedCount).toBe(0);
  });

  it('SEA-04: 一部が失効（invalid_subscription）だと sentCount が減り removedCount が増え、deleteByEndpoints が 1 回だけ呼ばれる', async () => {
    const pushSubscriptionRepository = new InMemoryPushSubscriptionRepository([
      subscription('https://example.com/ok-1'),
      subscription('https://example.com/stale'),
      subscription('https://example.com/ok-2'),
    ]);
    const pushSender = new MockPushSender(
      new Map([['https://example.com/stale', { ok: false, reason: 'invalid_subscription' }]]),
    );

    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      pushSubscriptionRepository,
      pushSender,
    ).execute(asOf);

    expect(result.sentCount).toBe(2);
    expect(result.removedCount).toBe(1);
    expect(pushSubscriptionRepository.deleteByEndpointsCalls).toEqual([
      ['https://example.com/stale'],
    ]);
  });

  it('SEA-05: 一部が other エラーの場合は購読を削除しない', async () => {
    const pushSubscriptionRepository = new InMemoryPushSubscriptionRepository([
      subscription('https://example.com/ok'),
      subscription('https://example.com/error'),
    ]);
    const pushSender = new MockPushSender(
      new Map([['https://example.com/error', { ok: false, reason: 'other' }]]),
    );

    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      pushSubscriptionRepository,
      pushSender,
    ).execute(asOf);

    expect(result.sentCount).toBe(1);
    expect(result.removedCount).toBe(0);
    expect(pushSubscriptionRepository.deleteByEndpointsCalls).toHaveLength(0);
  });

  it('SEA-06: 失効購読が複数でも deleteByEndpoints はちょうど 1 回、まとめて呼ばれる（N+1 回避）', async () => {
    const pushSubscriptionRepository = new InMemoryPushSubscriptionRepository([
      subscription('https://example.com/1'),
      subscription('https://example.com/2'),
      subscription('https://example.com/3'),
      subscription('https://example.com/4'),
      subscription('https://example.com/5'),
    ]);
    const pushSender = new MockPushSender(
      new Map([
        ['https://example.com/1', { ok: false, reason: 'invalid_subscription' }],
        ['https://example.com/3', { ok: false, reason: 'invalid_subscription' }],
        ['https://example.com/5', { ok: false, reason: 'invalid_subscription' }],
      ]),
    );

    await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      pushSubscriptionRepository,
      pushSender,
    ).execute(asOf);

    expect(pushSubscriptionRepository.deleteByEndpointsCalls).toHaveLength(1);
    expect(pushSubscriptionRepository.deleteByEndpointsCalls[0]).toEqual(
      expect.arrayContaining([
        'https://example.com/1',
        'https://example.com/3',
        'https://example.com/5',
      ]),
    );
    expect(pushSubscriptionRepository.deleteByEndpointsCalls[0]).toHaveLength(3);
  });

  it('SEA-07: 数量 0 の在庫は通知だけから除外される（P-10b）', async () => {
    const pushSender = new MockPushSender();
    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([
        stockDto({ id: 'zero', displayName: '無くなった牛乳', amount: { value: 0, unit: '本' } }),
        stockDto({ id: 'present', displayName: '牛乳', amount: { value: 1, unit: '本' } }),
      ]),
      new InMemoryPushSubscriptionRepository([subscription('https://example.com/a')]),
      pushSender,
    ).execute(asOf);

    expect(result.expiringStockCount).toBe(1);
    expect(pushSender.payloads[0]?.body).not.toContain('無くなった牛乳');
    expect(pushSender.payloads[0]?.body).toContain('牛乳');
  });

  it('SEA-08: 期限切れ在庫を含む', async () => {
    const pushSender = new MockPushSender();
    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto({ expiresAt: '2026-07-19' })]),
      new InMemoryPushSubscriptionRepository([subscription('https://example.com/a')]),
      pushSender,
    ).execute(asOf);

    expect(result.expiringStockCount).toBe(1);
    expect(pushSender.payloads[0]?.body).toContain('期限切れ');
  });

  it('SEA-09: pushSender.send が一部 reject しても execute() 全体は失敗しない', async () => {
    const pushSubscriptionRepository = new InMemoryPushSubscriptionRepository([
      subscription('https://example.com/ok'),
      subscription('https://example.com/rejecting'),
    ]);
    const pushSender = new MockPushSender(new Map([['https://example.com/rejecting', 'reject']]));

    const result = await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      pushSubscriptionRepository,
      pushSender,
    ).execute(asOf);

    expect(result.sentCount).toBe(1);
    expect(result.removedCount).toBe(0);
  });

  it('SEA-10: 通知本文は先頭 3 件 +「他 n 件」、url は先頭在庫への deep-link', async () => {
    const pushSender = new MockPushSender();
    await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([
        stockDto({ id: '1', displayName: '牛乳', expiresAt: '2026-07-21' }),
        stockDto({ id: '2', displayName: '卵', expiresAt: '2026-07-22' }),
        stockDto({ id: '3', displayName: '豆腐', expiresAt: '2026-07-23' }),
        stockDto({ id: '4', displayName: '納豆', expiresAt: '2026-07-24' }),
        stockDto({ id: '5', displayName: 'ヨーグルト', expiresAt: '2026-07-24' }),
      ]),
      new InMemoryPushSubscriptionRepository([subscription('https://example.com/a')]),
      pushSender,
    ).execute(asOf);

    const [payload] = pushSender.payloads;
    // expiry-alert-ops P-1 / P-3: タップ先は先頭 1 件のみ。本文のダイジェスト件数は変えない。
    expect(payload?.url).toBe('/pantry?stock=1');
    expect(payload?.body).toContain('牛乳（本日まで）');
    expect(payload?.body).toContain('卵（明日まで）');
    expect(payload?.body).toContain('豆腐（あと2日）');
    expect(payload?.body).toContain('他2件');
    expect(payload?.body).not.toContain('納豆');
    expect(payload?.url).not.toContain('stock=2');
  });

  it('SEA-11: asOf を内部で mutate しない', async () => {
    const pushSender = new MockPushSender();
    const asOfInput = new Date('2026-07-21T09:00:00');
    const asOfBefore = asOfInput.getTime();

    await new SendExpiryAlertsUseCase(
      new FakeGetExpiringStocksUseCase([stockDto()]),
      new InMemoryPushSubscriptionRepository([subscription('https://example.com/a')]),
      pushSender,
    ).execute(asOfInput);

    expect(asOfInput.getTime()).toBe(asOfBefore);
  });
});
