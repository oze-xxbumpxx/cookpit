import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { ProductDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { toProductDto, toStoreNameMap } from './product.mapper';

export class GetProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(id: string): Promise<ProductDto> {
    const productId = ProductId.fromString(id);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId.value);
    }

    const stores = await this.storeRepository.findAll();
    return toProductDto(product, toStoreNameMap(stores));
  }
}
