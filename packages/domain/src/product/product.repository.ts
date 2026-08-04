import type { StoreId } from '../shared/store';
import type { Product } from './product';
import type { ProductId } from './product-id';

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findAll(): Promise<Product[]>;
  save(product: Product): Promise<void>;
  delete(id: ProductId): Promise<void>;
  /**
   * 指定した店舗を参照する価格記録の件数を返す（商品をまたいだ合計）。
   * 削除で失われる件数の事前提示（ADR-0013 / `GET /api/stores/:id/usage`）に使う。
   * 集約を読み込まずに件数だけ返す。
   */
  countPriceRecordsByStore(storeId: StoreId): Promise<number>;
  /**
   * 指定した店舗を参照する価格記録を、全商品から物理削除する（ADR-0013 のカスケード削除）。
   * 店舗削除の前段でのみ呼ぶ。`price_records.store_id` の FK が restrict のため、
   * 店舗を消す前に必ずこれを通す必要がある。
   *
   * 集約（Product）を経由せず直接削除する。対象が全商品にまたがるため集約単位で扱えず、
   * かつ「店舗が消えた」という集約の外側の事情による後始末であるため。
   * 参照が 0 件の店舗 ID を渡しても例外にはならない（冪等）。
   */
  deletePriceRecordsByStore(storeId: StoreId): Promise<void>;
}
