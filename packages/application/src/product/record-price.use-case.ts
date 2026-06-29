import { Money } from '@cookpit/domain/src/shared/money';
import { PriceRecord } from '@cookpit/domain/src/product/product';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { UnitPriceCalculator } from '@cookpit/domain/src/product/unit-price-calculator';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { RecordPriceInputDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { StoreNotFoundError } from '../store/store-not-found.error';

export class RecordPriceUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async execute(input: RecordPriceInputDto): Promise<void> {
    if (input.priceAmount <= 0) {
      throw new Error('Price amount must be positive');
    }
    if (input.packageSizeValue <= 0) {
      throw new Error('Package size must be positive');
    }

    const productId = ProductId.fromString(input.productId);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId.value);
    }

    const storeId = StoreId.fromString(input.storeId);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(storeId.value);
    }

    const price = Money.of(input.priceAmount, 'JPY');
    const packageSize = Quantity.of(input.packageSizeValue, input.packageSizeUnit);
    const record = PriceRecord.create({
      id: PriceRecordId.generate(),
      storeId,
      price,
      unitPrice: UnitPriceCalculator.calculate(price, packageSize),
      packageSize,
      observedAt: new Date(),
    });

    product.recordPrice(record);
    await this.productRepository.save(product);
  }
}
