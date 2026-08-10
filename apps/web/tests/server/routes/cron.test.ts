import { SendExpiryAlertsUseCase } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
import { WebPushSender } from '@cookpit/infrastructure';
import type * as InfrastructureModule from '@cookpit/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    SendExpiryAlertsUseCase: vi.fn(),
  };
});

vi.mock('@cookpit/infrastructure', async (importOriginal) => {
  const actual = await importOriginal<typeof InfrastructureModule>();
  return {
    ...actual,
    WebPushSender: vi.fn(),
  };
});

const cronResult = {
  subscriptionCount: 2,
  sentCount: 1,
  removedCount: 1,
  expiringStockCount: 3,
};

describe('cronRoute', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalVapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const originalVapidSubject = process.env.VAPID_SUBJECT;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(WebPushSender).mockImplementation(function () {
      return {} as unknown as WebPushSender;
    });
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };
    restore('CRON_SECRET', originalCronSecret);
    restore('VAPID_PUBLIC_KEY', originalVapidPublicKey);
    restore('VAPID_PRIVATE_KEY', originalVapidPrivateKey);
    restore('VAPID_SUBJECT', originalVapidSubject);
  });

  it('WH-CRON-01: 正しい Bearer で 200 と ExpiryAlertsCronResult を返す', async () => {
    const execute = vi.fn().mockResolvedValue(cronResult);
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cronResult);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('WH-CRON-02: Authorization ヘッダーが欠落していると 401 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-CRON-03: Authorization ヘッダーが不一致だと 401 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-CRON-04: CRON_SECRET 未設定・ヘッダー欠落は 500 を返す（401 にならない）', async () => {
    delete process.env.CRON_SECRET;
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-CRON-05: CRON_SECRET 未設定なら正しい形式のヘッダーを送っても 500 を返す', async () => {
    delete process.env.CRON_SECRET;
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer undefined' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-CRON-06: CRON_SECRET が空文字なら 500 を返す', async () => {
    process.env.CRON_SECRET = '';
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer anything' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-CRON-07: UseCase 内の予期しない例外は Internal Server Error として 500 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('VAPID 環境変数が未設定の場合は認証成功後に 500 を返す', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const execute = vi.fn();
    vi.mocked(SendExpiryAlertsUseCase).mockImplementation(function () {
      return { execute } as unknown as SendExpiryAlertsUseCase;
    });

    const res = await app.request('/api/cron/expiry-alerts', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(execute).not.toHaveBeenCalled();
  });
});
