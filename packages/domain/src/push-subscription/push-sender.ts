/**
 * Push 送信の port（P-13 確定）。`packages/infrastructure/package.json` は `@cookpit/domain`
 * にのみ依存するため、Infrastructure が実装する port は Domain に置く。HTTP 型
 * （`Response`・生のステータスコード等）を漏らさないこと。`PushSendResult.reason` は
 * HTTP ステータスではなくドメイン語彙であり、この写像は Infrastructure が担う。
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string; // タップ時の遷移先（相対パス。P-7）
}

export type PushSendResult = { ok: true } | { ok: false; reason: 'invalid_subscription' | 'other' };

export interface PushSubscriptionTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSender {
  send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<PushSendResult>;
}
