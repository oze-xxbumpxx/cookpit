import {
  SubscribeToExpiryAlertUseCase,
  TooManySubscriptionsError,
  UnsubscribeFromExpiryAlertUseCase,
} from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';
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
    SubscribeToExpiryAlertUseCase: vi.fn(),
    UnsubscribeFromExpiryAlertUseCase: vi.fn(),
  };
});

const VALID_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/example-endpoint-id';
const VALID_P256DH =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7Dk';
const VALID_AUTH = 'tBHItJI5svbpez7KI4CCXg';

const validSubscribeBody = {
  endpoint: VALID_ENDPOINT,
  keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
};

describe('pushRoute', () => {
  const originalVapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalVapidPublicKey === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = originalVapidPublicKey;
    }
  });

  describe('GET /api/push/vapid-public-key', () => {
    it('WH-PUSH-01: 設定済みなら 200 で publicKey を返す', async () => {
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';

      const res = await app.request('/api/push/vapid-public-key');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ publicKey: 'test-public-key' });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('WH-PUSH-02: VAPID_PUBLIC_KEY が未設定なら 500 を返す', async () => {
      delete process.env.VAPID_PUBLIC_KEY;

      const res = await app.request('/api/push/vapid-public-key');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Server misconfigured' });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('WH-PUSH-03: VAPID_PUBLIC_KEY が空文字なら 500 を返す', async () => {
      process.env.VAPID_PUBLIC_KEY = '';

      const res = await app.request('/api/push/vapid-public-key');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('WH-PUSH-04: 正常な購読は 204 を返し UseCase を平坦化した引数で呼ぶ', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      vi.mocked(SubscribeToExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as SubscribeToExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSubscribeBody),
      });

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(execute).toHaveBeenCalledWith({
        endpoint: VALID_ENDPOINT,
        p256dh: VALID_P256DH,
        auth: VALID_AUTH,
      });
    });

    it.each([
      {
        name: 'endpoint が https でない',
        body: { ...validSubscribeBody, endpoint: 'http://example.com/x' },
      },
      {
        name: 'endpoint が URL 形式でない',
        body: { ...validSubscribeBody, endpoint: 'not-a-url' },
      },
      {
        name: 'keys が欠落',
        body: { endpoint: VALID_ENDPOINT },
      },
      {
        name: 'p256dh が base64url 外',
        body: { ...validSubscribeBody, keys: { p256dh: 'not base64url!', auth: VALID_AUTH } },
      },
    ])('WH-PUSH-05: $name の場合 400 で UseCase を呼ばない', async ({ body }) => {
      const execute = vi.fn();
      vi.mocked(SubscribeToExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as SubscribeToExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it('WH-PUSH-09: 購読件数上限超過は 422 を返す', async () => {
      const execute = vi.fn().mockRejectedValue(new TooManySubscriptionsError(10));
      vi.mocked(SubscribeToExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as SubscribeToExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSubscribeBody),
      });

      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'Too many push subscriptions (max 10)' });
    });

    it('WH-PUSH-10: 上限到達時でも既存 endpoint の再登録は 204 を返す', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      vi.mocked(SubscribeToExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as SubscribeToExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSubscribeBody),
      });

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/push/unsubscribe', () => {
    it('WH-PUSH-06: 存在する endpoint の解除は 204 を返す', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      vi.mocked(UnsubscribeFromExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as UnsubscribeFromExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: VALID_ENDPOINT }),
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(execute).toHaveBeenCalledWith({ endpoint: VALID_ENDPOINT });
    });

    it('WH-PUSH-07: 存在しない endpoint の解除も冪等に 204 を返す', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      vi.mocked(UnsubscribeFromExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as UnsubscribeFromExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: VALID_ENDPOINT }),
      });

      expect(res.status).toBe(204);
    });

    it('WH-PUSH-08: 不正な endpoint は 400 を返し UseCase を呼ばない', async () => {
      const execute = vi.fn();
      vi.mocked(UnsubscribeFromExpiryAlertUseCase).mockImplementation(function () {
        return { execute } as unknown as UnsubscribeFromExpiryAlertUseCase;
      });

      const res = await app.request('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'not-a-url' }),
      });

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
