import { ProductId } from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { ProductDetailResultDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { toCheapestStoreResultDto, toProductDto, toStoreNameMap } from './product.mapper';

/**
 * 商品詳細画面（`/products/[id]`）が必要とするデータを 1 回の呼び出しで取得する。
 * `productRepository.findById()` 1 回 + `storeRepository.findAll()` 1 回のみ発行し、
 * `storeRepository.findById()` は呼ばない（店舗名は `findAll()` の結果から解決する）。
 *
 * `cheapestStore` は次のいずれかで `null` になる: 価格記録が 1 件も無い場合、
 * および最安店舗として選ばれた店舗の最新記録が取得できない場合。
 * 店舗マスタに該当店舗が無い場合は `null` ではなく `storeName` を空文字へ縮退させる
 * （読み取り操作を例外で止めない。`GetCheapestStoreUseCase` と同じ方針）。
 *
 * `GetCheapestStoreUseCase` と共に `toCheapestStoreResultDto` を呼び出すことで、
 * 両方の結果の等価性を保つ。両方のユースケースは
 * `GET /api/products/:id/cheapest-store` が引き続き使用中のため残し、
 * 等価性は試験 `GPD-03` / 縮退は `GPD-05` が担保する。
 *
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
        : toCheapestStoreResultDto(
            product,
            cheapestStoreId,
            storeMap.get(cheapestStoreId.value) ?? '',
          );

    return { product: productDto, cheapestStore };
  }
}
