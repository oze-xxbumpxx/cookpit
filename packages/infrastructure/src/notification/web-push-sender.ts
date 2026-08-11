import webpush from 'web-push';
import type {
  PushPayload,
  PushSendResult,
  PushSender,
  PushSubscriptionTarget,
} from '@cookpit/domain';

/**
 * `PushSender`（`@cookpit/domain`）の実装（P-13 確定）。Push Service からの 404/410 を
 * `reason: 'invalid_subscription'` に、それ以外は `'other'` に写像する（HTTP → ドメイン語彙の
 * 変換責任）。コンストラクタは検証済みの VAPID 設定を受け取る前提とし、内部でフォールバック
 * （`?? ''` 等）は行わない。
 */
export class WebPushSender implements PushSender {
  constructor(vapidPublicKey: string, vapidPrivateKey: string, vapidSubject: string) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  async send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<PushSendResult> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { timeout: 10_000 },
      );
      return { ok: true };
    } catch (error) {
      // endpoint や鍵が漏れうるため error オブジェクト自体はログに出さない。statusCode のみ読む。
      if (error instanceof webpush.WebPushError) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          return { ok: false, reason: 'invalid_subscription' };
        }
      }
      return { ok: false, reason: 'other' };
    }
  }
}
