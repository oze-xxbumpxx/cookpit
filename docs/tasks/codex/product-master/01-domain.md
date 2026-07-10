# Task 1: Domain 層 — Product 集約の実装

## 概要

商品マスタ（Product）のドメインモデルを実装する。
既存の Recipe 集約（`packages/domain/src/recipe/`）と同じパターンに従う。

## アーキテクチャ制約

- `packages/domain` は他パッケージに依存しない（Clean Architecture の核）
- ORM（Drizzle）や HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- `any` 禁止、default export 禁止、型のみは `import type`、`===`/`!==`、値なしは `null`
- コメントは Why が非自明な時のみ

## 実装対象ファイル

すべて `packages/domain/src/` 配下に新規作成する。

### 1. `shared/money.ts` — Money 値オブジェクト

```typescript
import type が必要な外部依存: なし

export class Money {
  private constructor(
    private readonly moneyAmount: number,
    private readonly moneyCurrency: string,
  ) {}

  static of(amount: number, currency: string): Money
  // amount < 0 → throw new Error('Money amount must be non-negative')
  // 0 は OK

  add(other: Money): Money
  // 異通貨 → throw new Error('Cannot add different currencies')

  multiply(factor: number): Money
  // 係数倍した新 Money を返す

  isLessThan(other: Money): boolean
  // 同通貨比較。金額が小さければ true

  get amount(): number
  get currency(): string
}
```

### 2. `shared/store.ts` — StoreId 値オブジェクト + Store Entity

RecipeId (`packages/domain/src/recipe/recipe-id.ts`) と同パターン。

```typescript
import { randomUUID } from 'node:crypto';

export class StoreId {
  private constructor(private readonly storeIdValue: string) {}
  static generate(): StoreId; // new StoreId(randomUUID())
  static fromString(value: string): StoreId;
  equals(other: StoreId): boolean;
  get value(): string;
}

export class Store {
  private constructor(
    private readonly storeId: StoreId,
    private readonly storeName: string,
    private readonly createdDate: Date,
  ) {}

  static create(input: { name: string }): Store;
  // name.trim() === '' → throw new Error('Store name is required')
  // new Store(StoreId.generate(), name, new Date())

  static reconstruct(props: { id: StoreId; name: string; createdAt: Date }): Store;

  get id(): StoreId;
  get name(): string;
  get createdAt(): Date;
}
```

### 3. `shared/store.repository.ts` — StoreRepository インターフェース

```typescript
import type { Store } from './store';
import type { StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
}
```

### 4. `product/product-id.ts` — ProductId 値オブジェクト

RecipeId と完全に同パターン。

```typescript
import { randomUUID } from 'node:crypto';

export class ProductId {
  private constructor(private readonly productIdValue: string) {}
  static generate(): ProductId;
  static fromString(value: string): ProductId;
  equals(other: ProductId): boolean;
  get value(): string;
}
```

### 5. `product/price-record-id.ts` — PriceRecordId 値オブジェクト

ProductId と同パターン。

```typescript
export class PriceRecordId {
  private constructor(private readonly priceRecordIdValue: string) {}
  static generate(): PriceRecordId;
  static fromString(value: string): PriceRecordId;
  equals(other: PriceRecordId): boolean;
  get value(): string;
}
```

### 6. `product/product.ts` — Product 集約 + PriceRecord 値オブジェクト

**模範コード**: `packages/domain/src/recipe/recipe.ts` を参照。同じ構造に従う。

```typescript
import type { Quantity } from '../shared/quantity';
import type { Unit } from '../shared/unit';
import { Money } from '../shared/money';
import { StoreId } from '../shared/store';
import { ProductId } from './product-id';
import { PriceRecordId } from './price-record-id';

export type ProductCategory = '野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | 'その他';
```

**PriceRecord 値オブジェクト**（イミュータブル）:

- フィールド: `id: PriceRecordId`, `storeId: StoreId`, `price: Money`, `unitPrice: Money`, `packageSize: Quantity`, `observedAt: Date`
- `static create(props: {...}): PriceRecord` — バリデーションなし（UseCase 入口で保証済み）
- `static reconstruct(props: {...}): PriceRecord` — DB 復元用
- 全フィールドのゲッター

**Product 集約**:

- フィールド: `id: ProductId`, `name: string`, `aliases: string[]`, `category: ProductCategory`, `defaultUnit: Unit`, `priceHistory: PriceRecord[]`, `createdAt: Date`, `updatedAt: Date`

```typescript
interface CreateProductInput {
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

interface UpdateProductInput {
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

interface ProductProps {
  id: ProductId;
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
  priceHistory: PriceRecord[];
  createdAt: Date;
  updatedAt: Date;
}
```

- `static create(input: CreateProductInput): Product`
  - `name.trim() === ''` → `throw new Error('Product name is required')`
  - `ProductId.generate()`, `now = new Date()`, 空 `priceHistory`
- `static reconstruct(props: ProductProps): Product`
- `update(input: UpdateProductInput): void` — name バリデーション + `this.touch()`
- `recordPrice(record: PriceRecord): void` — `priceHistory` に push + `this.touch()`
- `latestPriceAt(storeId: StoreId): PriceRecord | null`
  - `priceHistory` を `storeId` で絞り込み → `observedAt` 降順ソート → 先頭
- `cheapestStoreAt(at: Date): StoreId | null`
  - 全 StoreId を収集 → 各 `latestPriceAt()` → `unitPrice.amount` で比較 → 最小の storeId。記録なしは `null`
- `private touch(): void` — `this.updatedDate = new Date()`
- ゲッター全フィールド（`priceHistory` はスプレッドコピーで返す）

### 7. `product/unit-price-calculator.ts` — ドメインサービス

```typescript
import { Money } from '../shared/money';
import { Quantity } from '../shared/quantity';

export class UnitPriceCalculator {
  static calculate(priceAmount: number, packageSize: Quantity): Money {
    const WEIGHT_UNITS = new Set(['g', 'kg']);
    const VOLUME_UNITS = new Set(['ml', 'l']);
    const unit = packageSize.unit;
    const value = packageSize.value;
    let unitPriceAmount: number;

    if (WEIGHT_UNITS.has(unit)) {
      const gramValue = unit === 'kg' ? value * 1000 : value;
      unitPriceAmount = (priceAmount / gramValue) * 100; // 100g あたり
    } else if (VOLUME_UNITS.has(unit)) {
      const mlValue = unit === 'l' ? value * 1000 : value;
      unitPriceAmount = (priceAmount / mlValue) * 100; // 100ml あたり
    } else {
      unitPriceAmount = priceAmount / value; // 1個あたり
    }

    const rounded = Math.round(unitPriceAmount * 10) / 10;
    return Money.of(rounded, 'JPY');
  }
}
```

### 8. `product/product.repository.ts` — ProductRepository インターフェース

```typescript
import type { Product } from './product';
import type { ProductId } from './product-id';

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findAll(): Promise<Product[]>;
  save(product: Product): Promise<void>;
  delete(id: ProductId): Promise<void>;
}
```

## テスト

テストランナーは Vitest。co-located（`src/**/*.test.ts`）で配置する。
既存テスト例: `packages/domain/src/recipe/recipe.test.ts`

### `shared/money.test.ts`

- `Money.of(100, 'JPY')` — 正常
- `Money.of(0, 'JPY')` — 0 は OK
- `Money.of(-1, 'JPY')` — throw
- `add` — 正常加算、異通貨で throw
- `multiply` — 正常
- `isLessThan` — true/false の両ケース

### `shared/store.test.ts`

- `StoreId.generate()` — UUID 形式を返す
- `StoreId.fromString()` — 往復一致
- `Store.create({ name: 'テスト' })` — 正常
- `Store.create({ name: '  ' })` — throw

### `product/product-id.test.ts`

- `generate()` が UUID 形式を返す
- `fromString()` の往復一致

### `product/product.test.ts`

- `Product.create()` — name 空白エラー、正常作成
- `Product.recordPrice()` — 追加後に `priceHistory` に含まれる
- `Product.latestPriceAt()` — 単一、複数（最新が返る）、存在しない storeId → null
- `Product.cheapestStoreAt()` — 記録なし → null、単一店舗、複数店舗（最安が返る）
- `PriceRecord.create()` — 正常動作

### `product/unit-price-calculator.test.ts`

- 重量系 g: `137円 / 300g → 100g あたり 45.7円`
- 重量系 kg: `300円 / 1kg → 100g あたり 30.0円`
- 容量系 ml: 正常
- 容量系 l: l→ml 変換後
- 個数系（`個`）: `priceAmount / value`
- 調理単位（`大さじ`）: `priceAmount / value`

## 完了条件

```bash
pnpm --filter @cookpit/domain test        # 全 green
pnpm --filter @cookpit/domain type-check  # 通過
pnpm lint                                  # 通過
```

## 注意事項

- `packages/domain/src/recipe/recipe-ingredient.ts` 内のローカル `interface ProductId` は**削除しない**（Sprint 2 スコープ外）
- `packages/domain/src/index.ts` は現在ほぼ空（`// domain package`）。Domain パッケージはサブパスで直接 import するパターンなので、index.ts への export 追加は不要
