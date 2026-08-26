import { ProductId } from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { CheapestStoreResultDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { toCheapestStoreResultDto } from './product.mapper';

/**
 * 単一商品の最安店舗を返す。`GET /api/products/:id/cheapest-store` が使用する。
 *
 * `GetProductDetailUseCase` と共に `toCheapestStoreResultDto` を呼び出すことで、
 * 両方の結果の等価性を保つ。両方のユースケースは
 * `GET /api/products/:id/cheapest-store` が引き続き使用中のため残し、
 * 等価性は試験 `GPD-03` / 縮退は `GPD-05` が担保する。
 */
export class GetCheapestStoreUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(productIdValue: string): Promise<CheapestStoreResultDto | null> {
    const productId = ProductId.fromString(productIdValue);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId.value);
    }

    const cheapestStoreId = product.cheapestStoreAt(new Date());
    if (cheapestStoreId === null) {
      return null;
    }

    // 価格履歴が参照する店舗が見つからなくても、一覧取得（toProductDto）と同様に
    // storeName を空文字へ縮退させ、読み取り操作を例外で止めない。
    const store = await this.storeRepository.findById(cheapestStoreId);

    return toCheapestStoreResultDto(product, cheapestStoreId, store?.name ?? '');
  }
}
