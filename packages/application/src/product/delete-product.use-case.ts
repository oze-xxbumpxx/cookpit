import { ProductId } from '@cookpit/domain';
import type { UnitOfWork, ProductRepository } from '@cookpit/domain';
import { ProductNotFoundError } from './product-not-found.error';

export class DeleteProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(id: string): Promise<void> {
    return this.unitOfWork.execute(async () => {
      const productId = ProductId.fromString(id);
      const product = await this.productRepository.findById(productId);
      if (product === null) {
        throw new ProductNotFoundError(productId.value);
      }

      await this.productRepository.delete(productId);
    });
  }
}
