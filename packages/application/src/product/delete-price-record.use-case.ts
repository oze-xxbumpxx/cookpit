import { PriceRecordId, ProductId } from '@cookpit/domain';
import type { ProductRepository } from '@cookpit/domain';
import { PriceRecordNotFoundError } from './price-record-not-found.error';
import type { DeletePriceRecordInputDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';

/**
 * 価格記録を 1 件削除する。誤った価格・内容量で記録したものを消して記録し直すための操作で、
 * 取り消し（undo）は無い。
 */
export class DeletePriceRecordUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  /**
   * @throws ProductNotFoundError 商品が存在しない場合
   * @throws PriceRecordNotFoundError 商品にその価格記録が無い場合
   */
  async execute(input: DeletePriceRecordInputDto): Promise<void> {
    const productId = ProductId.fromString(input.productId);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(input.productId);
    }

    const priceRecordId = PriceRecordId.fromString(input.priceRecordId);
    const exists = product.priceHistory.some((record) => record.id.equals(priceRecordId));
    if (!exists) {
      throw new PriceRecordNotFoundError(input.priceRecordId);
    }

    product.removePriceRecord(priceRecordId);
    await this.productRepository.save(product);
  }
}
