import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
  save(store: Store): Promise<void>;
  /**
   * 店舗を物理削除する（ADR-0012）。参照が残っていないかの検査は呼び出し側（UseCase）の責務で、
   * このメソッド自体は検査しない。存在しない ID を渡しても例外にはならない（冪等）。
   */
  delete(id: StoreId): Promise<void>;
}
