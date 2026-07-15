# Task 2: Infrastructure 層 — stocks スキーマ + DrizzlePantryRepository

## 概要

`stocks` テーブルを DB スキーマ・PGlite テスト DDL・マイグレーションに追加し、
`DrizzlePantryRepository` を実装する。**模範コード**:
`packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`（upsert +
`notInArray` 削除の sync パターン・`toDate` のローカル日付整形）。

依存: Task 1（`Pantry`/`Stock`/`PantryRepository` の型）完了していること。

## アーキテクチャ制約（必ず遵守）

- DB スキーマ形 ⇔ ドメインモデル形の変換責任は Repository 実装が持つ。Domain 層は DB の形を知らない
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==` / 「値なし」は `null`
- **テーブル名は複数形**（`stocks`。単数形にしない）
- 既存 7 テーブル（recipes / products / price_records / stores / meal_plans / planned_recipes /
  shopping_lists / shopping_items）の定義は一切変更しない

## 実装対象ファイル

| 種別 | ファイル                                                                     | 内容                                                       |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 追記 | `packages/infrastructure/src/db/schema.ts`                                   | `stocks` テーブル定義・型（S-2）                           |
| 追記 | `packages/infrastructure/src/testing/create-test-db.ts`                      | DDL 文字列に `stocks` 追記（**IMP-2・必須**）              |
| 新規 | `apps/web/src/db/migrations/0007_xxxxx.sql` ほか                             | `drizzle-kit generate` 自動生成（IMP-1）                   |
| 新規 | `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`      | `DrizzlePantryRepository`                                  |
| 新規 | `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts` | PGlite 統合テスト                                          |
| 追記 | `packages/infrastructure/src/index.ts`                                       | `export * from './repositories/drizzle-pantry.repository'` |

## 1. `schema.ts` 追記（そのまま実装。契約 §2.3 の確定形）

```typescript
export const stocks = pgTable(
  'stocks',
  {
    id: text('id').primaryKey(),
    productId: text('product_id'), // null 許容・FK なし（集約またぎ。D-8/S-5）
    displayName: text('display_name').notNull(), // S-5
    amountValue: numeric('amount_value', { precision: 10, scale: 3 }).notNull(),
    amountUnit: text('amount_unit').notNull(),
    purchasedAt: timestamp('purchased_at').notNull(),
    expiresAt: date('expires_at'), // null 許容（S-4 案 α）
    storedLocation: text('stored_location'), // null 許容（S-4 案 α）。'fridge'|'freezer'|'pantry'
    sourceShoppingItemId: text('source_shopping_item_id').unique(),
    // ↑ UNIQUE = 「1 bought 品目 : 最大 1 Stock」不変条件（S-3 の二重追加防止の最終防衛線）
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('stocks_product_id_idx').on(table.productId)],
);

export type StockRow = typeof stocks.$inferSelect;
export type NewStockRow = typeof stocks.$inferInsert;
```

`date`/`index`/`numeric`/`pgTable`/`text`/`timestamp` は既存 import 文にすべて含まれているため
**`schema.ts` 先頭の import 文の変更は不要**（確認済み）。**`pantries` テーブルは作らない**（S-1/S-2）。

## 2. `create-test-db.ts` DDL 追記（IMP-2。漏れると Infrastructure テスト全滅）

`DDL` 定数の末尾（`shopping_items_shopping_list_id_idx` の後）に以下を追記。カラム名・型・制約を
`schema.ts` と完全一致させる:

```sql
CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY,
  product_id text,
  display_name text NOT NULL,
  amount_value numeric(10, 3) NOT NULL,
  amount_unit text NOT NULL,
  purchased_at timestamp NOT NULL,
  expires_at date,
  stored_location text,
  source_shopping_item_id text UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocks_product_id_idx ON stocks (product_id);
```

## 3. マイグレーション生成（IMP-1）

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: `apps/web/src/db/migrations/`（`0007_xxxxx.sql`。名前部分は自動採番）
- 生成 `.sql` に `CREATE TABLE "stocks"`・`source_shopping_item_id` の UNIQUE・
  `stocks_product_id_idx` の CREATE INDEX が含まれること
- `meta/_journal.json` は新エントリ追記のみ（既存 `0000`〜`0006` 無変更）
- **既存 7 テーブルへの `ALTER` 文が含まれないこと**
- 生成ファイルは手動編集せずそのままコミット対象

## 4. `DrizzlePantryRepository`（そのまま実装）

```typescript
import { notInArray } from 'drizzle-orm';
import { Pantry, Stock, type StorageLocation } from '@cookpit/domain/src/pantry/pantry';
import { PantryId } from '@cookpit/domain/src/pantry/pantry-id';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import type { DrizzleClient } from '../db/client';
import { stocks, type NewStockRow, type StockRow } from '../db/schema';
import { toUnit } from './mappers';

export class DrizzlePantryRepository implements PantryRepository {
  constructor(private readonly db: DrizzleClient) {}

  async find(): Promise<Pantry> {
    const rows = await this.db.select().from(stocks).orderBy(stocks.purchasedAt);
    return Pantry.reconstruct({
      id: PantryId.singleton(),
      stocks: rows.map((row) => this.toEntity(row)),
    });
  }

  async save(pantry: Pantry): Promise<void> {
    const stockRows = this.toStockRows(pantry);
    const currentIds = stockRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db.delete(stocks).where(notInArray(stocks.id, currentIds));
    } else {
      await this.db.delete(stocks);
    }

    for (const row of stockRows) {
      await this.db
        .insert(stocks)
        .values(row)
        .onConflictDoUpdate({
          target: stocks.id,
          set: { amountValue: row.amountValue },
        });
    }
  }

  private toEntity(row: StockRow): Stock {
    return Stock.reconstruct({
      id: StockId.fromString(row.id),
      productId: row.productId === null ? null : ProductId.fromString(row.productId),
      displayName: row.displayName,
      amount: Quantity.of(Number(row.amountValue), toUnit(row.amountUnit)),
      purchasedAt: row.purchasedAt,
      expiresAt: row.expiresAt === null ? null : toDate(row.expiresAt),
      storedLocation: row.storedLocation === null ? null : toStorageLocation(row.storedLocation),
      sourceShoppingItemId:
        row.sourceShoppingItemId === null
          ? null
          : ShoppingItemId.fromString(row.sourceShoppingItemId),
    });
  }

  private toStockRows(pantry: Pantry): NewStockRow[] {
    return pantry.stocks.map((stock) => ({
      id: stock.id.value,
      productId: stock.productId?.value ?? null,
      displayName: stock.displayName,
      amountValue: stock.amount.value.toString(),
      amountUnit: stock.amount.unit,
      purchasedAt: stock.purchasedAt,
      expiresAt: stock.expiresAt === null ? null : toDateString(stock.expiresAt),
      storedLocation: stock.storedLocation,
      sourceShoppingItemId: stock.sourceShoppingItemId?.value ?? null,
    }));
  }
}

function toDate(value: string): Date {
  return new Date(value + 'T00:00:00');
}

function toDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function toStorageLocation(value: string): StorageLocation {
  switch (value) {
    case 'fridge':
    case 'freezer':
    case 'pantry':
      return value;
    default:
      throw new Error(`Unknown stored location: ${value}`);
  }
}
```

## 5. `infrastructure/src/index.ts` 追記

```typescript
export * from './repositories/drizzle-pantry.repository';
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- `numeric` カラムの読み出しは **`Number()` 変換**を入れる（`amountValue`。文字列のまま返さない）
- `date` 型カラム（`expiresAt`）は必ず **`'T00:00:00'` を付与**してから `new Date()`
  （JST 前日ずれ回避。`toISOString().slice` は書き込み側でも使わずローカル日付整形）
- `save()` は単一テーブルのため `notInArray` 削除 → 全行 upsert の**単段**構成
  （shopping-list の「親 upsert → 子 sync」の 2 段構成にしない。親テーブルという概念がない）
- upsert の `set` 対象は **`amountValue` のみ**（他フィールドは Stock 生成後に不変。
  `consumeStock` で変わるのは amount のみという Domain の不変条件と対応）
- `find()` は **`ORDER BY purchased_at ASC`**（FIFO 表示順）
- テーブル名は **`stocks`（複数形）**・index 名は `stocks_product_id_idx`

## テスト（`drizzle-pantry.repository.test.ts`。PGlite 統合・`createTestDb()` 使用）

- 空 DB での `find()` → `stocks: []` の空 Pantry が復元される（**null を返さない**。S-1）
- `save()` → `find()`: 単一 Stock の全フィールド一致復元
- **nullability 全パターンの round-trip**: `productId`/`expiresAt`/`storedLocation`/
  `sourceShoppingItemId` それぞれ null と非 null の組み合わせ
- `source_shopping_item_id` の **UNIQUE 制約違反**（同一値の Stock 2 件保存でエラー。S-3 最終防衛線）
- 同一 `id` での再 `save()` は 1 行のまま `amount_value` のみ更新（`productId`/`displayName` 等は不変）
- Stock を除いた `Pantry` の再 `save()` で該当行が DELETE される（**0 件時の全 DELETE 分岐を含む**）
- `amountValue` が `number` 型で復元される
- `expiresAt` の往復でタイムゾーンずれがない
- `find()` の復元順が `purchasedAt` 昇順（FIFO）

## 完了条件

- [ ] `pnpm --filter @cookpit/infrastructure test` 全 green
- [ ] `pnpm --filter @cookpit/infrastructure type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `schema.ts` / `create-test-db.ts` の既存 7 テーブル分に変更がない
- [ ] マイグレーションが `apps/web/src/db/migrations/` に生成され、既存マイグレーション無変更
- [ ] `save()` の upsert `set` が `amountValue` のみ
