import type { Product } from './product';
import type { ProductId } from './product-id';

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findAll(): Promise<Product[]>;
  save(product: Product): Promise<void>;
  delete(id: ProductId): Promise<void>;
}
