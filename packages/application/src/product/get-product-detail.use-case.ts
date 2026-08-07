import { ProductId } from '@cookpit/domain';
import type { Product, ProductRepository, StoreId, StoreRepository } from '@cookpit/domain';
import type { CheapestStoreResultDto, ProductDetailResultDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { toProductDto, toStoreNameMap, type StoreNameMap } from './product.mapper';

/**
 * 商品詳細画面（`/products/[id]`）が必要とするデータを 1 回の呼び出しで取得する。
 * `productRepository.findById()` 1 回 + `storeRepository.findAll()` 1 回のみ発行し、
 * `storeRepository.findById()` は呼ばない（店舗名は `findAll()` の結果から解決する）。
 * @throws {ProductNotFoundError} `id` に対応する商品が存在しない場合。
 */
export class GetProductDetailUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(id: string): Promise<ProductDetailResultDto> {
    const productId = ProductId.fromString(id);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId.value);
    }

    const stores = await this.storeRepository.findAll();
    const storeMap = toStoreNameMap(stores);
    const productDto = toProductDto(product, storeMap);

    const cheapestStoreId = product.cheapestStoreAt(new Date());
    const cheapestStore =
      cheapestStoreId === null
        ? null
        : this.toCheapestStoreResult(product, cheapestStoreId, storeMap);

    return { product: productDto, cheapestStore };
  }

  private toCheapestStoreResult(
    product: Product,
    cheapestStoreId: StoreId,
    storeMap: StoreNameMap,
  ): CheapestStoreResultDto | null {
    const latestPriceRecord = product.latestPriceRecordAt(cheapestStoreId);
    if (latestPriceRecord === null) {
      return null;
    }
    return {
      storeId: cheapestStoreId.value,
      storeName: storeMap.get(cheapestStoreId.value) ?? '',
      latestPrice: latestPriceRecord.price.amount,
      unitPrice: latestPriceRecord.unitPrice.amount,
      packageSizeUnit: latestPriceRecord.packageSize.unit,
    };
  }
}
