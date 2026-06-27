# Task 2: Infrastructure 層 — DB スキーマ + Drizzle Repository

## 前提

Task 1（Domain 層）が完了していること。

## 概要

Product / Store / PriceRecord の DB スキーマを Drizzle で定義し、
ドメインモデルとの変換を行う Repository を実装する。

## アーキテクチャ制約

- Infrastructure 層は Domain 層のインターフェースを実装する
- DB スキーマ形 ⇔ ドメインモデル形 の変換責任は Repository 実装が持つ
- 模範コード: `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`

## 実装対象ファイル

### 1. `packages/infrastructure/src/db/schema.ts` — テーブル定義追記

既存の `recipes` テーブル定義の**後に**追記する。既存行は変更しない。

```typescript
// 既存 import に numeric を追加:
import { integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// --- 以下を既存 recipes 定義の後に追加 ---

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default([]),
  category: text('category').notNull(),
  defaultUnit: text('default_unit').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;

export const priceRecords = pgTable('price_records', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: text('store_id').notNull().references(() => stores.id),
  priceAmount: numeric('price_amount', { precision: 10, scale: 1 }).notNull(),
  unitPriceAmount: numeric('unit_price_amount', { precision: 10, scale: 1 }).notNull(),
  packageSizeValue: numeric('package_size_value', { precision: 10, scale: 3 }).notNull(),
  packageSizeUnit: text('package_size_unit').notNull(),
  observedAt: timestamp('observed_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PriceRecordRow = typeof priceRecords.$inferSelect;
export type NewPriceRecordRow = typeof priceRecords.$inferInsert;
```

**注意**: Drizzle の `numeric` は文字列として返る。Repository の `toEntity` で `Number()` 変換が必要。

### 2. `packages/infrastructure/src/repositories/drizzle-product.repository.ts` — 新規

模範: `drizzle-recipe.repository.ts` の構造に従う。

```typescript
import { eq } from 'drizzle-orm';
import { Product, type ProductCategory } from '@cookpit/domain/src/product/product';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { Unit } from '@cookpit/domain/src/shared/unit';
import type { DrizzleClient } from '../db/client';
import { products, priceRecords, type ProductRow, type PriceRecordRow } from '../db/schema';
```

**実装する4メソッド:**

`findById(id: ProductId): Promise<Product | null>`:
- `products LEFT JOIN price_records ON products.id = price_records.product_id WHERE products.id = $id`
- Drizzle の `leftJoin` + `where(eq(products.id, id.value))`
- 結果行を JS 側で groupBy → `toEntity()` でドメイン変換
- 結果が空 → `null`

`findAll(): Promise<Product[]>`:
- `products LEFT JOIN price_records` 全件
- JS 側で `productId` ごとにグルーピング → `map(toEntity)`
- `orderBy(products.createdAt)`

`save(product: Product): Promise<void>`:
- products テーブルへ upsert: `INSERT ... ON CONFLICT DO UPDATE`（`drizzle-recipe.repository.ts` の `onConflictDoUpdate` パターン踏襲）
- `product.priceHistory` の各 PriceRecord を `price_records` テーブルへ upsert（PK = `id`）
- add-only（既存 PriceRecord の削除は行わない）

`delete(id: ProductId): Promise<void>`:
- `DELETE FROM products WHERE id = $id`
- `ON DELETE CASCADE` により `price_records` も自動削除

**private ヘルパー:**

`toEntity(productRow: ProductRow, priceRecordRows: PriceRecordRow[]): Product`:
- `Product.reconstruct(...)` で復元
- 各 PriceRecord は `PriceRecord.reconstruct(...)` で復元
- `numeric` カラム（文字列）→ `Number()` 変換が必要
- `toUnit()` / `toProductCategory()` ヘルパー関数を `drizzle-recipe.repository.ts` の `toUnit` / `toRecipeTag` と同パターンで定義

`toProductCategory(value: string): ProductCategory`:
```typescript
function toProductCategory(value: string): ProductCategory {
  switch (value) {
    case '野菜':
    case '肉':
    case '魚':
    case '調味料':
    case '乾物':
    case '冷凍':
    case 'その他':
      return value;
    default:
      throw new Error(`Unknown product category: ${value}`);
  }
}
```

`toUnit()` は `drizzle-recipe.repository.ts` に既にある同名関数と同じロジック。このファイル内にも同じ内容で定義する（ファイル間の private 関数は共有しない）。

### 3. `packages/infrastructure/src/repositories/drizzle-store.repository.ts` — 新規

```typescript
import { eq } from 'drizzle-orm';
import { Store } from '@cookpit/domain/src/shared/store';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { DrizzleClient } from '../db/client';
import { stores } from '../db/schema';

export class DrizzleStoreRepository implements StoreRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: StoreId): Promise<Store | null> {
    const rows = await this.db.select().from(stores).where(eq(stores.id, id.value)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return Store.reconstruct({
      id: StoreId.fromString(row.id),
      name: row.name,
      createdAt: row.createdAt,
    });
  }

  async findAll(): Promise<Store[]> {
    const rows = await this.db.select().from(stores).orderBy(stores.createdAt);
    return rows.map((row) =>
      Store.reconstruct({
        id: StoreId.fromString(row.id),
        name: row.name,
        createdAt: row.createdAt,
      }),
    );
  }
}
```

### 4. `packages/infrastructure/src/index.ts` — 追記

既存行に変更なし。末尾に追記:

```typescript
export * from './repositories/drizzle-product.repository';
export * from './repositories/drizzle-store.repository';
```

### 5. マイグレーション生成 + Store シード

スキーマ追記後に実行:

```bash
pnpm --filter @cookpit/web db:generate
```

`drizzle/migrations/` 配下に新しいマイグレーションファイルが生成される。

**Store シード**: マイグレーション内またはシードスクリプトで投入。

```sql
INSERT INTO stores (id, name, created_at)
VALUES
  ('<固定UUID-A>', 'コモディイイダ', NOW()),
  ('<固定UUID-B>', 'ライフ', NOW())
ON CONFLICT (id) DO NOTHING;
```

UUID は `crypto.randomUUID()` 等で生成して固定値を使う。
既存のシードパターンがなければ `seed.ts` スクリプトを新規作成する。

## 完了条件

```bash
pnpm --filter @cookpit/infrastructure type-check  # 通過
pnpm lint                                          # 通過
# マイグレーション実行後:
# stores / products / price_records テーブルが作成されていること
# stores テーブルにシードデータ2件が存在すること
```
