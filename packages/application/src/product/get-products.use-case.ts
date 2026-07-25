import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { ProductDto } from './product.dto';
import { toProductDto, toStoreNameMap } from './product.mapper';

export class GetProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(): Promise<ProductDto[]> {
    const products = await this.productRepository.findAll();
    const stores = await this.storeRepository.findAll();
    const storeMap = toStoreNameMap(stores);

    return products.map((product) => toProductDto(product, storeMap));
  }
}
