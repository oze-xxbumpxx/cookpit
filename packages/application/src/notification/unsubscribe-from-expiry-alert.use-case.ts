import type { PushSubscriptionRepository } from '@cookpit/domain';

export interface UnsubscribeFromExpiryAlertInputDto {
  endpoint: string;
}

/** 冪等。存在しない endpoint でも例外を投げない。 */
export class UnsubscribeFromExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: UnsubscribeFromExpiryAlertInputDto): Promise<void> {
    await this.pushSubscriptionRepository.deleteByEndpoint(input.endpoint);
  }
}
