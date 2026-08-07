import { ProductId } from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { CheapestStoreResultDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';

/**
 * 単一商品の最安店舗を返す。`GET /api/products/:id/cheapest-store` が使用する。
 *
 * **`CheapestStoreResultDto` の組み立ては `GetProductDetailUseCase` にも存在する**
 * （商品詳細画面はクエリ削減のためそちらを使う。設計書
 * `docs/designs/product-detail-performance.md` §変更後構成）。
 * **片方だけ変えると等価性が崩れる。** 等価性は試験 `GPD-03` / 縮退は `GPD-05` が
 * 担保している（レビュー S-1）。
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

    const latestPriceRecord = product.latestPriceRecordAt(cheapestStoreId);
    if (latestPriceRecord === null) {
      return null;
    }

    // 価格履歴が参照する店舗が見つからなくても、一覧取得（toProductDto）と同様に
    // storeName を空文字へ縮退させ、読み取り操作を例外で止めない。
    const store = await this.storeRepository.findById(cheapestStoreId);

    return {
      storeId: cheapestStoreId.value,
      storeName: store?.name ?? '',
      latestPrice: latestPriceRecord.price.amount,
      unitPrice: latestPriceRecord.unitPrice.amount,
      packageSizeUnit: latestPriceRecord.packageSize.unit,
    };
  }
}
