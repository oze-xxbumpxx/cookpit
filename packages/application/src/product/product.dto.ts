import type { ProductCategory, Unit } from '@cookpit/domain';

export interface PriceRecordDto {
  /** 価格記録の一意な ID（UUID）。1 件ずつ削除するために公開している。 */
  id: string;
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

export interface ProductDetailResultDto {
  product: ProductDto;
  cheapestStore: CheapestStoreResultDto | null;
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

export interface DeletePriceRecordInputDto {
  productId: string;
  priceRecordId: string;
}

export interface RecordPriceInputDto {
  productId: string;
  storeId: string;
  priceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
}

export interface UpdatePriceRecordInputDto {
  productId: string;
  priceRecordId: string;
  storeId: string;
  priceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
}
