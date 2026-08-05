import {
  Money,
  PriceRecordId,
  ProductId,
  Quantity,
  StoreId,
  UnitPriceCalculator,
} from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { ProductDto, UpdatePriceRecordInputDto } from './product.dto';
import { PriceRecordNotFoundError } from './price-record-not-found.error';
import { toProductDto, toStoreNameMap } from './product.mapper';
import { ProductNotFoundError } from './product-not-found.error';
import { StoreNotFoundError } from '../store/store-not-found.error';

/**
 * 価格記録の店舗・価格・内容量を編集する。記録日時（observedAt）と ID は元の値を維持し、
 * 変更できない（要件定義書 D-1・D-3）。単価は UnitPriceCalculator で再計算する。
 */
export class UpdatePriceRecordUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  /**
   * @throws ProductNotFoundError 商品が存在しない場合
   * @throws PriceRecordNotFoundError 商品にその価格記録が無い場合
   * @throws StoreNotFoundError 指定した店舗が存在しない場合
   */
  async execute(input: UpdatePriceRecordInputDto): Promise<ProductDto> {
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

    const storeId = StoreId.fromString(input.storeId);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(input.storeId);
    }

    const price = Money.of(input.priceAmount, 'JPY');
    const packageSize = Quantity.of(input.packageSizeValue, input.packageSizeUnit);
    const unitPrice = UnitPriceCalculator.calculate(price, packageSize);

    product.updatePriceRecord(priceRecordId, { storeId, price, unitPrice, packageSize });
    await this.productRepository.save(product);

    const stores = await this.storeRepository.findAll();
    return toProductDto(product, toStoreNameMap(stores));
  }
}
