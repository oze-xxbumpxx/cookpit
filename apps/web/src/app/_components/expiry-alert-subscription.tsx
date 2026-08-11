'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { API_FAILURE_MESSAGE, useApiAction } from '@/lib/use-api-action';
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';

const UNSUPPORTED_MESSAGE = 'このブラウザは通知に対応していません。';
const PERMISSION_DENIED_MESSAGE = '通知が許可されなかったため、設定できませんでした。';
const VAPID_UNAVAILABLE_MESSAGE =
  '通知の設定を読み込めませんでした。時間をおいて再度お試しください。';
const SUBSCRIPTION_LIMIT_MESSAGE = '通知を設定できる端末数の上限に達しています。';

/**
 * VAPID 公開鍵（base64url）を `PushManager.subscribe()` の `applicationServerKey` が
 * 要求する `Uint8Array` へ変換する（標準的な `urlBase64ToUint8Array` 実装）。
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  // `new Uint8Array(length)` は必ず（Shared ではない）`ArrayBuffer` を裏付けとして持つが、
  // TS の型付けでは `ArrayBufferLike` として広く推論されるため `BufferSource` と直接
  // 一致しない（`PushManager.subscribe()` の `applicationServerKey` が要求する型）。
  return outputArray as BufferSource;
}

function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator;
}

export function ExpiryAlertSubscription() {
  const action = useApiAction();
  const [supported] = useState<boolean>(isPushSupported);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [vapidUnavailable, setVapidUnavailable] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  // 初期表示時に navigator.serviceWorker.ready 経由で現在の購読状態を判定するまでの間、
  // ON/OFF どちらか誤った状態でボタン操作をさせないための待機フラグ。非対応ブラウザでは
  // 判定自体を行わないため初期値を `false` にする（effect 内での同期 setState を避けるため、
  // 「非対応なら判定不要」を早期 return ではなく初期値そのもので表現する）。
  const [checkingSubscription, setCheckingSubscription] = useState<boolean>(isPushSupported);

  useEffect(() => {
    if (!supported) {
      return;
    }
    let cancelled = false;

    async function initialize(): Promise<void> {
      try {
        const response = await client.api.push['vapid-public-key'].$get();
        if (cancelled) {
          return;
        }
        if (response.ok) {
          const body = await response.json();
          setVapidPublicKey(body.publicKey);
        } else {
          setVapidUnavailable(true);
        }
      } catch {
        if (!cancelled) {
          setVapidUnavailable(true);
        }
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSubscribed(existing !== null);
        }
      } finally {
        if (!cancelled) {
          setCheckingSubscription(false);
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function handleSubscribe(): Promise<void> {
    // iOS は権限要求がユーザー操作起点でないと失敗するため、クリックハンドラの
    // 呼び出しスタック内から同期的に呼び出す（罠 3）。
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      action.setErrorMessage(PERMISSION_DENIED_MESSAGE);
      return;
    }
    if (vapidPublicKey === null) {
      action.setErrorMessage(VAPID_UNAVAILABLE_MESSAGE);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = pushSubscription.toJSON();
    const keys = json.keys;
    if (json.endpoint === undefined || keys === undefined) {
      action.setErrorMessage(API_FAILURE_MESSAGE);
      return;
    }
    const endpoint = json.endpoint;

    await action.run(
      () =>
        client.api.push.subscribe.$post({
          json: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        }),
      {
        onSuccessWithoutBody: () => setSubscribed(true),
        failureMessage: (status) =>
          status === 422 ? SUBSCRIPTION_LIMIT_MESSAGE : API_FAILURE_MESSAGE,
      },
    );
  }

  async function handleUnsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing === null) {
      setSubscribed(false);
      return;
    }
    const endpoint = existing.endpoint;
    await existing.unsubscribe();

    await action.run(() => client.api.push.unsubscribe.$post({ json: { endpoint } }), {
      onSuccessWithoutBody: () => setSubscribed(false),
    });
  }

  if (!supported) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <p className="text-xs text-muted-foreground">{UNSUPPORTED_MESSAGE}</p>
        <Button type="button" variant="outline" disabled className="h-9">
          通知に非対応
        </Button>
      </div>
    );
  }

  const subscribeDisabled =
    action.pending || checkingSubscription || (vapidUnavailable && !subscribed);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <span className="flex items-center gap-2 text-sm text-foreground">
          {subscribed ? (
            <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <BellOff className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          期限が近づいたら通知
        </span>
        <Button
          type="button"
          variant={subscribed ? 'outline' : 'default'}
          disabled={subscribeDisabled}
          onClick={() => void (subscribed ? handleUnsubscribe() : handleSubscribe())}
          className="h-9"
        >
          {action.pending ? '処理中' : subscribed ? '通知をオフにする' : '通知をオンにする'}
        </Button>
      </div>
      {vapidUnavailable && !subscribed && (
        <p className="text-xs text-destructive">{VAPID_UNAVAILABLE_MESSAGE}</p>
      )}
      {action.errorMessage !== null && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {action.errorMessage}
        </p>
      )}
    </div>
  );
}
