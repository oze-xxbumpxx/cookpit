import { Store } from '@cookpit/domain';
import type { StoreRepository } from '@cookpit/domain';
import type { CreateStoreInputDto, StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

export class CreateStoreUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  async execute(input: CreateStoreInputDto): Promise<StoreDto> {
    const store = Store.create({ name: input.name });
    await this.storeRepository.save(store);
    return toStoreDto(store);
  }
}
