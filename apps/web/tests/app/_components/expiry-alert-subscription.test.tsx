import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

    // 対応可否の判定はマウント後に行うため、非対応の案内も判定後に現れる。
    expect(await screen.findByText('このブラウザは通知に対応していません。')).toBeDefined();
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

    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText('通知の設定を読み込めませんでした。時間をおいて再度お試しください。'),
    ).toBeDefined();
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

  it('EAS-11: 購読状態の判定中は ON/OFF を断定せず「確認中」の無効ボタンを表示する', async () => {
    stubPushSupportedEnvironment({ existingSubscription: createMockSubscription() });

    render(<ExpiryAlertSubscription />);

    const waiting = screen.getByRole('button', { name: '確認中' });
    expect(waiting.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: '通知をオンにする' })).toBeNull();

    expect(await screen.findByRole('button', { name: '通知をオフにする' })).toBeDefined();
  });

  it('EAS-12: サーバー描画も待機表示になる（ハイドレーション不一致を起こさない）', () => {
    // サーバーには window の Push API が無く、非対応ブラウザと同じ判定結果になる。この
    // 条件でも非対応ブランチを描画しないことが、初期表示の切り替わりを防ぐ条件。
    stubPushUnsupportedEnvironment();

    const html = renderToString(<ExpiryAlertSubscription />);

    expect(html).toContain('期限が近づいたら通知');
    expect(html).toContain('確認中');
    expect(html).not.toContain('このブラウザは通知に対応していません。');
  });

  it('EAS-13: サーバー描画の HTML を対応ブラウザでハイドレーションしても不一致にならない', async () => {
    // サーバー相当（Push API 無し）で描画した HTML を、Push 対応ブラウザでハイドレーションする。
    // 描画結果が食い違うと React が復旧エラーを報告し、画面が作り直されて表示が切り替わる。
    stubPushUnsupportedEnvironment();
    const html = renderToString(<ExpiryAlertSubscription />);
    stubPushSupportedEnvironment({ existingSubscription: createMockSubscription() });

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverableErrors: string[] = [];

    const root = await act(async () =>
      hydrateRoot(container, <ExpiryAlertSubscription />, {
        onRecoverableError: (error) => recoverableErrors.push(String(error)),
      }),
    );

    expect(recoverableErrors).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('EAS-14: iOS かつ非 standalone ではホーム画面追加の案内を出す（ボタンは無効化しない）', async () => {
    stubPushSupportedEnvironment();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)' ? false : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'iPhone',
    });

    render(<ExpiryAlertSubscription />);

    expect(
      await screen.findByText(
        'iPhone / iPad では、ホーム画面に追加したアプリから開くと通知を受け取れます。',
      ),
    ).toBeDefined();
    const button = await screen.findByRole('button', { name: '通知をオンにする' });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('EAS-15: standalone（PWA）ではホーム画面追加の案内を出さない', async () => {
    stubPushSupportedEnvironment();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'iPhone',
    });

    render(<ExpiryAlertSubscription />);

    await screen.findByRole('button', { name: '通知をオンにする' });
    expect(
      screen.queryByText(
        'iPhone / iPad では、ホーム画面に追加したアプリから開くと通知を受け取れます。',
      ),
    ).toBeNull();
  });

  it('EAS-16: 非 iOS ではホーム画面追加の案内を出さない', async () => {
    stubPushSupportedEnvironment();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux armv8l',
    });

    render(<ExpiryAlertSubscription />);

    await screen.findByRole('button', { name: '通知をオンにする' });
    expect(
      screen.queryByText(
        'iPhone / iPad では、ホーム画面に追加したアプリから開くと通知を受け取れます。',
      ),
    ).toBeNull();
  });
});
