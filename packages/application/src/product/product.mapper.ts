import type { PriceRecord, Product, Store } from '@cookpit/domain';
import type { PriceRecordDto, ProductDto } from './product.dto';

export type StoreNameMap = Map<string, string>;

export function toStoreNameMap(stores: Store[]): StoreNameMap {
  return new Map(stores.map((store) => [store.id.value, store.name]));
}

export function normalizeAliases(aliases: string[]): string[] {
  return aliases.map((alias) => alias.trim()).filter((alias) => alias !== '');
}

export function toProductDto(product: Product, storeMap: StoreNameMap): ProductDto {
  return {
    id: product.id.value,
    name: product.name,
    aliases: product.aliases,
    category: product.category,
    defaultUnit: product.defaultUnit,
    priceHistory: product.priceHistory.map((record) => toPriceRecordDto(record, storeMap)),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toPriceRecordDto(record: PriceRecord, storeMap: StoreNameMap): PriceRecordDto {
  return {
    id: record.id.value,
    storeId: record.storeId.value,
    storeName: storeMap.get(record.storeId.value) ?? '',
    priceAmount: record.price.amount,
    unitPriceAmount: record.unitPrice.amount,
    packageSizeValue: record.packageSize.value,
    packageSizeUnit: record.packageSize.unit,
    observedAt: record.observedAt.toISOString(),
  };
}
