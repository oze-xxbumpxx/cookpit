import type { ProductCategory } from '@cookpit/domain/src/product/product';
import type { Unit } from '@cookpit/domain/src/shared/unit';

export interface PriceRecordDto {
  storeId: string;
  storeName: string;
  priceAmount: number;
  unitPriceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
  observedAt: string;
}

export interface ProductDto {
  id: string;
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
  priceHistory: PriceRecordDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CheapestStoreResultDto {
  storeId: string;
  storeName: string;
  latestPrice: number;
  unitPrice: number;
  packageSizeUnit: Unit;
}

export interface CreateProductInputDto {
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface UpdateProductInputDto {
  id: string;
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface RecordPriceInputDto {
  productId: string;
  storeId: string;
  priceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
}
