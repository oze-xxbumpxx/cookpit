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
   * 店舗削除の可否判定（ADR-0012）のためだけに使う。集約を読み込まずに件数だけ返す。
   */
  countPriceRecordsByStore(storeId: StoreId): Promise<number>;
}
