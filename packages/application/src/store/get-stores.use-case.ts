import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

export class GetStoresUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  async execute(): Promise<StoreDto[]> {
    const stores = await this.storeRepository.findAll();
    return stores.map(toStoreDto);
  }
}
