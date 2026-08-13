import {
  Money,
  PriceRecord,
  PriceRecordId,
  ProductId,
  Quantity,
  StoreId,
  UnitPriceCalculator,
} from '@cookpit/domain';
import type { UnitOfWork, ProductRepository, StoreRepository } from '@cookpit/domain';
import type { RecordPriceInputDto } from './product.dto';
import { ProductNotFoundError } from './product-not-found.error';
import { UnitPriceNotPositiveError } from './unit-price-not-positive.error';
import { StoreNotFoundError } from '../store/store-not-found.error';

export class RecordPriceUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: RecordPriceInputDto): Promise<void> {
    return this.unitOfWork.execute(async () => {
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
      const unitPrice = UnitPriceCalculator.calculate(price, packageSize);
      if (unitPrice.amount <= 0) {
        throw new UnitPriceNotPositiveError(
          input.priceAmount,
          input.packageSizeValue,
          input.packageSizeUnit,
        );
      }

      const record = PriceRecord.create({
        id: PriceRecordId.generate(),
        storeId,
        price,
        unitPrice,
        packageSize,
        observedAt: new Date(),
      });

      product.recordPrice(record);
      await this.productRepository.save(product);
    });
  }
}
