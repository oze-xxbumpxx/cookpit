import { ProductId } from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { ProductDto, UpdateProductInputDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { normalizeAliases, toProductDto, toStoreNameMap } from './product.mapper';

export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(input: UpdateProductInputDto): Promise<ProductDto> {
    const productId = ProductId.fromString(input.id);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId.value);
    }

    product.update({
      name: input.name,
      aliases: normalizeAliases(input.aliases),
      category: input.category,
      defaultUnit: input.defaultUnit,
    });

    await this.productRepository.save(product);

    const stores = await this.storeRepository.findAll();
    return toProductDto(product, toStoreNameMap(stores));
  }
}
