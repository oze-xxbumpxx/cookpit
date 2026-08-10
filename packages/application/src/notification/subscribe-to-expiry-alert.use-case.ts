import { PushSubscription } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
import { TooManySubscriptionsError } from './too-many-subscriptions.error';

export interface SubscribeToExpiryAlertInputDto {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 購読件数の上限（P-15 確定）。既存 endpoint の再登録（upsert）はこの上限の対象外。 */
export const MAX_SUBSCRIPTION_COUNT = 10;

/**
 * endpoint が既存なら鍵を更新（upsert）、無ければ新規購読を作成する（P-8）。
 * 新規購読時のみ `MAX_SUBSCRIPTION_COUNT` の上限を適用する（P-15。既存 endpoint の
 * 再登録は上限の対象外 — 正規利用者が再購読できなくなるのを防ぐ）。
 *
 * @throws TooManySubscriptionsError 新規 endpoint かつ既存購読数が上限以上の場合
 */
export class SubscribeToExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: SubscribeToExpiryAlertInputDto): Promise<void> {
    const existing = await this.pushSubscriptionRepository.findByEndpoint(input.endpoint);

    if (existing === null) {
      const currentCount = (await this.pushSubscriptionRepository.findAll()).length;
      if (currentCount >= MAX_SUBSCRIPTION_COUNT) {
        throw new TooManySubscriptionsError(MAX_SUBSCRIPTION_COUNT);
      }
    }

    const subscription =
      existing === null
        ? PushSubscription.create(input)
        : PushSubscription.reconstruct({
            id: existing.id,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            createdAt: existing.createdAt,
          });
    await this.pushSubscriptionRepository.save(subscription);
  }
}
