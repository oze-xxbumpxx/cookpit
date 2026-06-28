import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
  save(store: Store): Promise<void>;
}
