import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { WebPushSender } from '../../src/notification/web-push-sender';

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
      readonly headers: Record<string, string> = {},
      readonly body: string = '',
      readonly endpoint: string = '',
    ) {
      super(message);
    }
  }

  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
      WebPushError,
    },
  };
});

const mockedWebpush = vi.mocked(webpush);

describe('WebPushSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('コンストラクタが setVapidDetails を正しい引数で呼ぶ', () => {
    new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    expect(mockedWebpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'public-key',
      'private-key',
    );
  });

  it('送信が成功すると { ok: true } を返す (INF-WPS-01)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockResolvedValueOnce({
      statusCode: 201,
      body: '',
      headers: {},
    });
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    const result = await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    expect(result).toEqual({ ok: true });
    expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/x',
        keys: { p256dh: 'p256dh', auth: 'auth' },
      },
      JSON.stringify({ title: 'title', body: 'body', url: '/pantry' }),
      { timeout: 10_000 },
    );
  });

  it('timeout オプションを 10_000ms で渡す (INF-WPS-02)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockResolvedValueOnce({
      statusCode: 201,
      body: '',
      headers: {},
    });
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    const call = mockedWebpush.sendNotification.mock.calls[0];
    expect(call?.[2]).toEqual({ timeout: 10_000 });
  });

  it('statusCode 404 は invalid_subscription に写像する (INF-WPS-03)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockRejectedValueOnce(
      new mockedWebpush.WebPushError('Gone', 404, {}, '', 'https://fcm.googleapis.com/fcm/send/x'),
    );
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    const result = await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    expect(result).toEqual({ ok: false, reason: 'invalid_subscription' });
  });

  it('statusCode 410 は invalid_subscription に写像する (INF-WPS-04)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockRejectedValueOnce(
      new mockedWebpush.WebPushError('Gone', 410, {}, '', 'https://fcm.googleapis.com/fcm/send/x'),
    );
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    const result = await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    expect(result).toEqual({ ok: false, reason: 'invalid_subscription' });
  });

  it('404/410 以外の statusCode は other に写像する (INF-WPS-05)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockRejectedValueOnce(
      new mockedWebpush.WebPushError(
        'Internal Server Error',
        500,
        {},
        '',
        'https://fcm.googleapis.com/fcm/send/x',
      ),
    );
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    const result = await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    expect(result).toEqual({ ok: false, reason: 'other' });
  });

  it('statusCode を持たない例外（ネットワークエラー等）は other に写像する (INF-WPS-06)', async () => {
    vi.mocked(mockedWebpush.sendNotification).mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const sender = new WebPushSender('public-key', 'private-key', 'mailto:test@example.com');

    const result = await sender.send(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p256dh', auth: 'auth' },
      { title: 'title', body: 'body', url: '/pantry' },
    );

    expect(result).toEqual({ ok: false, reason: 'other' });
  });
});
