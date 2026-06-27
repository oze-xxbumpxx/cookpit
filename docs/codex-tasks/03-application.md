# Task 3: Application 層 — UseCase + DTO + Mapper

## 前提

Task 1（Domain 層）が完了していること。Task 2 は並行可能だが、
型チェックには Infrastructure の export が必要。

## 概要

Product に関する 8 つの UseCase と関連する DTO / Mapper / Error クラスを実装する。
既存の Recipe UseCase（`packages/application/src/recipe/`）と同じパターンに従う。

## アーキテクチャ制約

- UseCase は 1 ユースケース = 1 クラス・`execute()` メソッドのみ
- DI は手動 DI（コンストラクタ注入）
- Application 層から `@cookpit/api-contract` への依存は禁止（依存方向: Presentation → Application → Domain）
- エラーハンドリングは UseCase の入口で行う

## 実装対象ファイル

すべて `packages/application/src/product/` 配下に新規作成する。

### 1. `product.dto.ts` — DTO 定義

模範: `packages/application/src/recipe/recipe.dto.ts`

```typescript
import type { ProductCategory } from '@cookpit/domain/src/product/product';
import type { Unit } from '@cookpit/domain/src/shared/unit';

export interface PriceRecordDto {
  storeId: string;
  storeName: string;
  priceAmount: number;
  unitPriceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
  observedAt: string; // ISO 文字列
}

export interface ProductDto {
  id: string;
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
  priceHistory: PriceRecordDto[];
  createdAt: string; // ISO 文字列
  updatedAt: string; // ISO 文字列
}

export interface StoreDto {
  id: string;
  name: string;
}

export interface CheapestStoreResultDto {
  storeId: string;
  storeName: string;
  latestPrice: number;
  unitPrice: number;
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
```

### 2. `product-not-found.error.ts`

模範: `packages/application/src/recipe/recipe-not-found.error.ts`

```typescript
export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}
```

### 3. `store-not-found.error.ts`

```typescript
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = 'StoreNotFoundError';
  }
}
```

### 4. `product.mapper.ts`

模範: `packages/application/src/recipe/recipe.mapper.ts`

```typescript
import type { Product } from '@cookpit/domain/src/product/product';
import type { PriceRecord } from '@cookpit/domain/src/product/product';
import type { Store } from '@cookpit/domain/src/shared/store';
import type { ProductDto, PriceRecordDto, StoreDto } from './product.dto';

export function toProductDto(product: Product, storeMap: Map<string, string>): ProductDto {
  return {
    id: product.id.value,
    name: product.name,
    aliases: product.aliases,
    category: product.category,
    defaultUnit: product.defaultUnit,
    priceHistory: product.priceHistory.map((r) => toPriceRecordDto(r, storeMap)),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

// storeMap: storeId.value → storeName
function toPriceRecordDto(record: PriceRecord, storeMap: Map<string, string>): PriceRecordDto {
  return {
    storeId: record.storeId.value,
    storeName: storeMap.get(record.storeId.value) ?? '',
    priceAmount: record.price.amount,
    unitPriceAmount: record.unitPrice.amount,
    packageSizeValue: record.packageSize.value,
    packageSizeUnit: record.packageSize.unit,
    observedAt: record.observedAt.toISOString(),
  };
}

export function toStoreDto(store: Store): StoreDto {
  return {
    id: store.id.value,
    name: store.name,
  };
}
```

### 5. UseCase 8ファイル

すべて同パターン: `constructor` でリポジトリを受け取り、`async execute(input): Promise<output>` のみ。
模範: `packages/application/src/recipe/create-recipe.use-case.ts`

#### `create-product.use-case.ts`

```typescript
constructor(private readonly productRepository: ProductRepository)

async execute(input: CreateProductInputDto): Promise<ProductDto>
  // aliases のトリム・空文字除去: input.aliases.map(a => a.trim()).filter(a => a !== '')
  // Product.create({ name: input.name, aliases, category: input.category, defaultUnit: input.defaultUnit })
  // productRepository.save(product)
  // toProductDto(product, new Map()) — 作成時は priceHistory 空なので storeMap 不要
```

#### `get-products.use-case.ts`

```typescript
constructor(
  private readonly productRepository: ProductRepository,
  private readonly storeRepository: StoreRepository,
)

async execute(): Promise<ProductDto[]>
  // productRepository.findAll()
  // storeRepository.findAll() → Map<string, string> 構築（store.id.value → store.name）
  // products.map(p => toProductDto(p, storeMap))
```

#### `get-product.use-case.ts`

```typescript
constructor(
  private readonly productRepository: ProductRepository,
  private readonly storeRepository: StoreRepository,
)

async execute(id: string): Promise<ProductDto>
  // ProductId.fromString(id) → productRepository.findById()
  // null → throw new ProductNotFoundError(id)
  // storeMap を storeRepository.findAll() から構築
  // toProductDto(product, storeMap)
```

#### `update-product.use-case.ts`

```typescript
constructor(
  private readonly productRepository: ProductRepository,
  private readonly storeRepository: StoreRepository,
)

async execute(input: UpdateProductInputDto): Promise<ProductDto>
  // findById → null → ProductNotFoundError
  // aliases トリム・空文字除去
  // product.update({ name, aliases, category, defaultUnit })
  // productRepository.save(product)
  // storeMap 構築 → toProductDto
```

#### `delete-product.use-case.ts`

```typescript
constructor(private readonly productRepository: ProductRepository)

async execute(id: string): Promise<void>
  // findById → null → ProductNotFoundError (U3 確定)
  // productRepository.delete(ProductId.fromString(id))
```

#### `record-price.use-case.ts`

```typescript
constructor(
  private readonly productRepository: ProductRepository,
  private readonly storeRepository: StoreRepository,
)

async execute(input: RecordPriceInputDto): Promise<void>
  // priceAmount <= 0 → throw（Zod で弾くが UseCase でも防衛）
  // packageSizeValue <= 0 → throw
  // productRepository.findById → null → ProductNotFoundError
  // storeRepository.findById → null → StoreNotFoundError
  // UnitPriceCalculator.calculate(input.priceAmount, Quantity.of(input.packageSizeValue, input.packageSizeUnit as Unit))
  // PriceRecord.create({ id: PriceRecordId.generate(), storeId, price: Money.of(input.priceAmount, 'JPY'), unitPrice, packageSize, observedAt: new Date() })
  // product.recordPrice(record)
  // productRepository.save(product)
```

#### `get-cheapest-store.use-case.ts`

```typescript
constructor(
  private readonly productRepository: ProductRepository,
  private readonly storeRepository: StoreRepository,
)

async execute(productId: string): Promise<CheapestStoreResultDto | null>
  // findById → null → ProductNotFoundError
  // product.cheapestStoreAt(new Date()) → cheapestStoreId
  // null → return null
  // storeRepository.findById(cheapestStoreId)
  // product.latestPriceAt(cheapestStoreId) で最新 PriceRecord 取得
  // return { storeId, storeName, latestPrice: record.price.amount, unitPrice: record.unitPrice.amount }
```

#### `get-stores.use-case.ts`

```typescript
constructor(private readonly storeRepository: StoreRepository)

async execute(): Promise<StoreDto[]>
  // storeRepository.findAll() → stores.map(toStoreDto)
```

### 6. `index.ts` + 親 index 追記

`packages/application/src/product/index.ts` (新規):
```typescript
export * from './create-product.use-case';
export * from './get-products.use-case';
export * from './get-product.use-case';
export * from './update-product.use-case';
export * from './delete-product.use-case';
export * from './record-price.use-case';
export * from './get-cheapest-store.use-case';
export * from './get-stores.use-case';
export * from './product.dto';
export * from './product-not-found.error';
export * from './store-not-found.error';
```

`packages/application/src/index.ts` に追記:
```typescript
export * from './product';
```

## テスト

模範: `packages/application/src/recipe/recipe-use-cases.test.ts`

ファイル: `packages/application/src/product/product-use-cases.test.ts`

**InMemoryProductRepository** と **InMemoryStoreRepository** を作成し、
DB なしで UseCase をテストする。

### InMemoryProductRepository

```typescript
class InMemoryProductRepository implements ProductRepository {
  private readonly store = new Map<string, Product>();
  public saveCount = 0;
  public deletedIds: string[] = [];

  async findById(id: ProductId): Promise<Product | null> {
    return this.store.get(id.value) ?? null;
  }
  async findAll(): Promise<Product[]> {
    return [...this.store.values()];
  }
  async save(product: Product): Promise<void> {
    this.saveCount += 1;
    this.store.set(product.id.value, product);
  }
  async delete(id: ProductId): Promise<void> {
    this.deletedIds.push(id.value);
    this.store.delete(id.value);
  }
  seed(product: Product): void {
    this.store.set(product.id.value, product);
  }
}
```

### InMemoryStoreRepository

```typescript
class InMemoryStoreRepository implements StoreRepository {
  private readonly store = new Map<string, Store>();

  async findById(id: StoreId): Promise<Store | null> {
    return this.store.get(id.value) ?? null;
  }
  async findAll(): Promise<Store[]> {
    return [...this.store.values()];
  }
  seed(store: Store): void {
    this.store.set(store.id.value, store);
  }
}
```

### テストケース

- **CreateProductUseCase**: 正常作成、name 空白エラー、aliases トリム動作
- **GetProductsUseCase**: 0件、複数件
- **GetProductUseCase**: 正常取得、存在しない → ProductNotFoundError
- **UpdateProductUseCase**: 正常更新、存在しない → ProductNotFoundError
- **DeleteProductUseCase**: 正常削除、存在しない → ProductNotFoundError
- **RecordPriceUseCase**: 正常記録、商品なし → ProductNotFoundError、店舗なし → StoreNotFoundError
- **GetCheapestStoreUseCase**: 記録なし → null、複数店舗 → 最安が返る
- **GetStoresUseCase**: 正常取得

## 完了条件

```bash
pnpm --filter @cookpit/application type-check  # 通過
pnpm --filter @cookpit/application test        # 全 green
pnpm lint                                       # 通過
```
