import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getVapidPublicKey, postSubscribe, postUnsubscribe } = vi.hoisted(() => ({
  getVapidPublicKey: vi.fn(),
  postSubscribe: vi.fn(),
  postUnsubscribe: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      push: {
        'vapid-public-key': { $get: (...args: unknown[]) => getVapidPublicKey(...args) },
        subscribe: { $post: (...args: unknown[]) => postSubscribe(...args) },
        unsubscribe: { $post: (...args: unknown[]) => postUnsubscribe(...args) },
      },
    },
  },
}));

import { ExpiryAlertSubscription } from '../../../src/app/_components/expiry-alert-subscription';

// 有効な base64url 文字列（atob デコード可能な形）である必要がある。実際の VAPID 公開鍵の
// 長さ（87 文字）に合わせたダミー値。
const VAPID_PUBLIC_KEY =
  'C9QGBYSHjHOO65BtCVJzBu4k6YwcDkPxEu1m4GgrbY74_ZkE0_MdsqJys63PMKYynvxgzEq9PpxegLZ2_OX_0ns';

interface MockPushSubscription {
  endpoint: string;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
}

function createMockSubscription(
  endpoint = 'https://fcm.googleapis.com/fcm/send/abc',
): MockPushSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let requestPermission: ReturnType<typeof vi.fn>;
let getSubscription: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;

/** `PushManager`/`navigator.serviceWorker`/`Notification` を対応ブラウザとしてスタブする。 */
function stubPushSupportedEnvironment(
  options: {
    existingSubscription?: MockPushSubscription | null;
  } = {},
): void {
  const { existingSubscription = null } = options;
  requestPermission = vi.fn().mockResolvedValue('granted');
  getSubscription = vi.fn().mockResolvedValue(existingSubscription);
  subscribe = vi.fn().mockResolvedValue(createMockSubscription());

  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { requestPermission });

  const registration = { pushManager: { getSubscription, subscribe } };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
}

function stubPushUnsupportedEnvironment(): void {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
}

describe('ExpiryAlertSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVapidPublicKey.mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: VAPID_PUBLIC_KEY }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.navigator, 'serviceWorker');
  });

  it('EAS-01: PushManager 非対応ブラウザでは ON ボタンが無効化され非対応の案内が出る', async () => {
    stubPushUnsupportedEnvironment();

    render(<ExpiryAlertSubscription />);

    expect(screen.getByText('このブラウザは通知に対応していません。')).toBeDefined();
    const button = screen.getByRole('button', { name: '通知に非対応' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('EAS-02: ON 押下→許可承認→購読成功で subscribe が呼ばれる', async () => {
    stubPushSupportedEnvironment();
    postSubscribe.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    await user.click(button);

    await waitFor(() => {
      expect(postSubscribe).toHaveBeenCalledWith({
        json: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知をオフにする' })).toBeDefined();
    });
  });

  it('EAS-03: ON 押下→許可拒否でエラー表示し subscribe を呼ばない', async () => {
    stubPushSupportedEnvironment();
    requestPermission.mockResolvedValue('denied');
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('通知が許可されなかったため、設定できませんでした。')).toBeDefined();
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(postSubscribe).not.toHaveBeenCalled();
  });

  it('EAS-04: requestPermission はクリックのコールスタック内で同期的に呼ばれる', async () => {
    stubPushSupportedEnvironment();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    fireEvent.click(button);

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('EAS-05: OFF 押下で購読解除される', async () => {
    stubPushSupportedEnvironment({ existingSubscription: createMockSubscription() });
    postUnsubscribe.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const offButton = await screen.findByRole('button', { name: '通知をオフにする' });
    await user.click(offButton);

    await waitFor(() => {
      expect(postUnsubscribe).toHaveBeenCalledWith({
        json: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知をオンにする' })).toBeDefined();
    });
  });

  it('EAS-06: VAPID 公開鍵取得が 500 のときエラー表示し ON ボタンが無効化される', async () => {
    stubPushSupportedEnvironment();
    getVapidPublicKey.mockResolvedValue({ ok: false, status: 500 });

    render(<ExpiryAlertSubscription />);

    await waitFor(() => {
      expect(
        screen.getByText('通知の設定を読み込めませんでした。時間をおいて再度お試しください。'),
      ).toBeDefined();
    });
    const button = screen.getByRole('button', { name: '通知をオンにする' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('EAS-07: subscribe が 422 のとき上限到達メッセージを表示する', async () => {
    stubPushSupportedEnvironment();
    postSubscribe.mockResolvedValue({ ok: false, status: 422 });
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('通知を設定できる端末数の上限に達しています。')).toBeDefined();
    });
  });

  it('EAS-08: 通信エラー時に通信エラーメッセージを表示する', async () => {
    stubPushSupportedEnvironment();
    postSubscribe.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('EAS-09: 購読処理中はボタンが disabled になる', async () => {
    stubPushSupportedEnvironment();
    let resolvePost: (value: { ok: boolean }) => void = () => {};
    postSubscribe.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<ExpiryAlertSubscription />);

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '処理中' }).hasAttribute('disabled')).toBe(true);
    });

    resolvePost({ ok: true });
  });

  it('EAS-10: 既存購読がある状態で再訪問すると OFF 表示になる', async () => {
    stubPushSupportedEnvironment({ existingSubscription: createMockSubscription() });

    render(<ExpiryAlertSubscription />);

    expect(await screen.findByRole('button', { name: '通知をオフにする' })).toBeDefined();
  });
});
