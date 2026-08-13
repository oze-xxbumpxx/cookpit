import type { UnitOfWork, PushSubscriptionRepository } from '@cookpit/domain';

export interface UnsubscribeFromExpiryAlertInputDto {
  endpoint: string;
}

/** 冪等。存在しない endpoint でも例外を投げない。 */
export class UnsubscribeFromExpiryAlertUseCase {
  constructor(
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: UnsubscribeFromExpiryAlertInputDto): Promise<void> {
    return this.unitOfWork.execute(async () => {
      await this.pushSubscriptionRepository.deleteByEndpoint(input.endpoint);
    });
  }
}
