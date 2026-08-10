import { PushSubscriptionId } from './push-subscription-id';

export interface CreatePushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionProps {
  id: PushSubscriptionId;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

/**
 * Push 購読情報（ブラウザが発行する `endpoint` と暗号化鍵 `p256dh` / `auth`）を表す集約。
 * `endpoint`/`p256dh`/`auth` の**形式**検証（URL・ホスト・base64url・長さ）は
 * api-contract 層の責務であり、`create()` は「空文字でないこと」のみを見る。
 */
export class PushSubscription {
  private constructor(
    private readonly subscriptionId: PushSubscriptionId,
    private readonly subscriptionEndpoint: string,
    private readonly subscriptionP256dh: string,
    private readonly subscriptionAuth: string,
    private readonly subscriptionCreatedAt: Date,
  ) {}

  /** @throws Error endpoint / p256dh / auth のいずれかが空文字（空白のみ含む）の場合 */
  static create(input: CreatePushSubscriptionInput): PushSubscription {
    if (input.endpoint.trim() === '' || input.p256dh.trim() === '' || input.auth.trim() === '') {
      throw new Error('endpoint, p256dh, auth must not be empty');
    }
    return new PushSubscription(
      PushSubscriptionId.generate(),
      input.endpoint,
      input.p256dh,
      input.auth,
      new Date(),
    );
  }

  static reconstruct(props: PushSubscriptionProps): PushSubscription {
    return new PushSubscription(
      props.id,
      props.endpoint,
      props.p256dh,
      props.auth,
      props.createdAt,
    );
  }

  get id(): PushSubscriptionId {
    return this.subscriptionId;
  }

  get endpoint(): string {
    return this.subscriptionEndpoint;
  }

  get p256dh(): string {
    return this.subscriptionP256dh;
  }

  get auth(): string {
    return this.subscriptionAuth;
  }

  get createdAt(): Date {
    return new Date(this.subscriptionCreatedAt);
  }
}
