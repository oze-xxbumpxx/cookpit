import { Product } from '@cookpit/domain';
import type { ProductRepository } from '@cookpit/domain';
import type { CreateProductInputDto, ProductDto } from './product.dto';
import { normalizeAliases, toProductDto } from './product.mapper';

export class CreateProductUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(input: CreateProductInputDto): Promise<ProductDto> {
    const product = Product.create({
      name: input.name,
      aliases: normalizeAliases(input.aliases),
      category: input.category,
      defaultUnit: input.defaultUnit,
    });

    await this.productRepository.save(product);

    return toProductDto(product, new Map());
  }
}
