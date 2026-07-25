import type { Store } from '@cookpit/domain';
import type { StoreDto } from './store.dto';

export function toStoreDto(store: Store): StoreDto {
  return {
    id: store.id.value,
    name: store.name,
    createdAt: store.createdAt.toISOString(),
  };
}
