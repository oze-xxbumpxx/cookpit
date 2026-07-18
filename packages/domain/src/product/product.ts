import { Money } from '../shared/money';
import type { Quantity } from '../shared/quantity';
import type { StoreId } from '../shared/store';
import type { Unit } from '../shared/unit';
import type { PriceRecordId } from './price-record-id';
import { ProductId } from './product-id';

export type ProductCategory = '野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | string;

export interface PriceRecordProps {
  id: PriceRecordId;
  storeId: StoreId;
  price: Money;
  unitPrice: Money;
  packageSize: Quantity;
  observedAt: Date;
}

export class PriceRecord {
  private constructor(
    private readonly priceRecordId: PriceRecordId,
    private readonly priceRecordStoreId: StoreId,
    private readonly priceRecordPrice: Money,
    private readonly priceRecordUnitPrice: Money,
    private readonly priceRecordPackageSize: Quantity,
    private readonly observedDate: Date,
  ) {}

  static create(props: PriceRecordProps): PriceRecord {
    if (props.price.amount <= 0) {
      throw new Error('Price record price must be positive');
    }
    if (props.unitPrice.amount <= 0) {
      throw new Error('Price record unit price must be positive');
    }
    if (props.packageSize.value <= 0) {
      throw new Error('Price record package size must be positive');
    }

    return new PriceRecord(
      props.id,
      props.storeId,
      props.price,
      props.unitPrice,
      props.packageSize,
      new Date(props.observedAt),
    );
  }

  static reconstruct(props: PriceRecordProps): PriceRecord {
    return new PriceRecord(
      props.id,
      props.storeId,
      props.price,
      props.unitPrice,
      props.packageSize,
      new Date(props.observedAt),
    );
  }

  get id(): PriceRecordId {
    return this.priceRecordId;
  }

  get storeId(): StoreId {
    return this.priceRecordStoreId;
  }

  get price(): Money {
    return this.priceRecordPrice;
  }

  get unitPrice(): Money {
    return this.priceRecordUnitPrice;
  }

  get packageSize(): Quantity {
    return this.priceRecordPackageSize;
  }

  get observedAt(): Date {
    return new Date(this.observedDate);
  }
}

export interface CreateProductInput {
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface UpdateProductInput {
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface ProductProps {
  id: ProductId;
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
  priceHistory: PriceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  private constructor(
    private readonly productId: ProductId,
    private productName: string,
    private productAliases: string[],
    private productCategory: ProductCategory,
    private productDefaultUnit: Unit,
    private productPriceHistory: PriceRecord[],
    private readonly createdDate: Date,
    private updatedDate: Date,
  ) {}

  static create(input: CreateProductInput): Product {
    if (input.name.trim() === '') {
      throw new Error('Product name is required');
    }

    const now = new Date();
    return new Product(
      ProductId.generate(),
      input.name,
      [...input.aliases],
      input.category,
      input.defaultUnit,
      [],
      now,
      now,
    );
  }

  static reconstruct(props: ProductProps): Product {
    return new Product(
      props.id,
      props.name,
      [...props.aliases],
      props.category,
      props.defaultUnit,
      [...props.priceHistory],
      new Date(props.createdAt),
      new Date(props.updatedAt),
    );
  }

  update(input: UpdateProductInput): void {
    if (input.name.trim() === '') {
      throw new Error('Product name is required');
    }

    this.productName = input.name;
    this.productAliases = [...input.aliases];
    this.productCategory = input.category;
    this.productDefaultUnit = input.defaultUnit;
    this.touch();
  }

  recordPrice(record: PriceRecord): void {
    this.productPriceHistory.push(record);
    this.touch();
  }

  latestPriceAt(storeId: StoreId): Money | null {
    return this.latestPriceRecordAt(storeId)?.price ?? null;
  }

  latestPriceRecordAt(storeId: StoreId): PriceRecord | null {
    const records = this.productPriceHistory
      .filter((record) => record.storeId.equals(storeId))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());

    return records[0] ?? null;
  }

  cheapestStoreAt(at: Date): StoreId | null {
    let cheapestRecord: PriceRecord | null = null;

    for (const record of this.latestRecordsByStoreAt(at)) {
      if (cheapestRecord === null || record.unitPrice.isLessThan(cheapestRecord.unitPrice)) {
        cheapestRecord = record;
      }
    }

    return cheapestRecord?.storeId ?? null;
  }

  averagePrice(storeId: StoreId, periodDays: number): Money | null {
    if (periodDays <= 0) {
      throw new Error('Period days must be positive');
    }

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - periodDays);

    const records = this.productPriceHistory.filter(
      (record) =>
        record.storeId.equals(storeId) && record.observedAt.getTime() >= threshold.getTime(),
    );
    const firstRecord = records[0] ?? null;
    if (firstRecord === null) {
      return null;
    }

    let total = firstRecord.price;
    for (const record of records.slice(1)) {
      total = total.add(record.price);
    }

    const averageAmount = Math.round((total.amount / records.length) * 10) / 10;
    return Money.of(averageAmount, firstRecord.price.currency);
  }

  isPriceLow(storeId: StoreId, currentPrice: Money): boolean {
    const average = this.averagePrice(storeId, 90);
    if (average === null) {
      return false;
    }

    return currentPrice.isLessThan(average);
  }

  get id(): ProductId {
    return this.productId;
  }

  get name(): string {
    return this.productName;
  }

  get aliases(): string[] {
    return [...this.productAliases];
  }

  get category(): ProductCategory {
    return this.productCategory;
  }

  get defaultUnit(): Unit {
    return this.productDefaultUnit;
  }

  get priceHistory(): PriceRecord[] {
    return [...this.productPriceHistory];
  }

  get createdAt(): Date {
    return new Date(this.createdDate);
  }

  get updatedAt(): Date {
    return new Date(this.updatedDate);
  }

  private latestRecordsByStoreAt(at: Date): PriceRecord[] {
    let latestRecords: PriceRecord[] = [];

    for (const record of this.productPriceHistory) {
      if (record.observedAt.getTime() > at.getTime()) {
        continue;
      }

      const currentRecord =
        latestRecords.find((latestRecord) => latestRecord.storeId.equals(record.storeId)) ?? null;
      if (currentRecord === null) {
        latestRecords.push(record);
        continue;
      }

      if (record.observedAt.getTime() > currentRecord.observedAt.getTime()) {
        latestRecords = latestRecords.map((latestRecord) =>
          latestRecord.storeId.equals(record.storeId) ? record : latestRecord,
        );
      }
    }

    return latestRecords;
  }

  private touch(): void {
    this.updatedDate = new Date();
  }
}
