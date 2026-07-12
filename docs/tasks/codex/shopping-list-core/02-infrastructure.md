# Task 2: Infrastructure 層 — DB スキーマ・Repository の実装

## 概要

`shopping_lists` / `shopping_items` の Drizzle スキーマ追記、PGlite テスト DDL 追記、
マイグレーション生成、`DrizzleShoppingListRepository` 実装 + PGlite 統合テスト。
**模範コード（必ず開いてパターンを踏襲すること）**:

- `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts` —
  JOIN グルーピング・`onConflictDoUpdate` + `notInArray` 削除パターン
- `packages/infrastructure/src/repositories/mappers.ts` — `toUnit`（既存・変更不要・再利用）

依存: Task 1（`ShoppingList`/`ShoppingItem`/`ShoppingListRepository` の型）。

## アーキテクチャ制約（必ず遵守）

- DB スキーマ形 ⇔ ドメインモデル形の変換責任は **Repository 実装**が持つ。復元は必ず
  `static reconstruct()` を通す（`create()` を使わない）
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==` / 「値なし」は `null`
- 既存 6 テーブル（`recipes`/`stores`/`products`/`price_records`/`meal_plans`/`planned_recipes`）の
  定義・既存マイグレーション（0000〜0005）は**一切変更しない**

## 実装対象ファイル

| 種別 | ファイル                                                                            | 内容                                                              |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 追記 | `packages/infrastructure/src/db/schema.ts`                                          | `shoppingLists`/`shoppingItems` テーブル定義・型                  |
| 追記 | `packages/infrastructure/src/testing/create-test-db.ts`                             | DDL 文字列に 2 テーブル追記（**漏れると本タスクのテスト全滅**）   |
| 新規 | `apps/web/src/db/migrations/0006_xxxxx.sql` + `meta/0006_snapshot.json`             | `drizzle-kit generate` 自動生成                                   |
| 追記 | `apps/web/src/db/migrations/meta/_journal.json`                                     | 自動更新（新エントリ追記）                                        |
| 新規 | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`      | `DrizzleShoppingListRepository`                                   |
| 新規 | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts` | PGlite 統合テスト                                                 |
| 追記 | `packages/infrastructure/src/index.ts`                                              | `export * from './repositories/drizzle-shopping-list.repository'` |

## 1. `schema.ts` 追記（S-1 別テーブル・D-6）

**テーブル名は複数形**（`shopping_lists` / `shopping_items`）。以下をそのまま追記する:

```typescript
export const shoppingLists = pgTable('shopping_lists', {
  id: text('id').primaryKey(),
  mealPlanId: text('meal_plan_id').notNull().unique(),
  // ↑ 集約またぎの ID 参照。FK なし（D-6・C-4 先例）。
  //   UNIQUE = 「1 MealPlan : 最大 1 ShoppingList」不変条件（S-6）＋ findByMealPlanId のインデックスを兼ねる
  shoppingDate: date('shopping_date').notNull(), // S-10: 週開始土曜の date
  status: text('status').notNull(), // 'active' | 'completed'（D-6: text）
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type NewShoppingListRow = typeof shoppingLists.$inferInsert;

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    shoppingListId: text('shopping_list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }), // 集約内親子
    productId: text('product_id'), // null 許容・FK なし（集約またぎ・D-6）
    displayName: text('display_name').notNull(),
    requiredAmountValue: numeric('required_amount_value', { precision: 10, scale: 3 }), // S-5 β
    requiredAmountUnit: text('required_amount_unit'), // S-5 β
    amountNote: text('amount_note'), // S-5 β
    targetStoreId: text('target_store_id'), // null 許容・FK なし（D-1/D-6）
    status: text('status').notNull(), // 'pending' | 'bought' | 'skipped'
    actualPriceAmount: numeric('actual_price_amount', { precision: 10, scale: 1 }), // bought 時のみ
    actualStoreId: text('actual_store_id'), // bought 時のみ
    source: text('source').notNull(), // 'from_meal_plan' | 'manually_added'
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('shopping_items_shopping_list_id_idx').on(table.shoppingListId)],
);

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type NewShoppingItemRow = typeof shoppingItems.$inferInsert;
```

- `date`/`index`/`numeric`/`pgTable`/`text`/`timestamp` は既存 import 文に含まれているため
  **import 文の変更は不要**（`schema.ts` 先頭を変更しない）
- **通貨カラムは持たない**（復元時に `'JPY'` を Repository が補う。
  `DrizzleProductRepository` の確定先例）

## 2. `create-test-db.ts` DDL 追記（必須。漏れ厳禁）

`DDL` 定数の末尾（`planned_recipes_meal_plan_id_idx` の後）に以下を追記する。カラム名・型・制約を
`schema.ts` と**完全一致**させる:

```sql
CREATE TABLE IF NOT EXISTS shopping_lists (
  id text PRIMARY KEY,
  meal_plan_id text NOT NULL UNIQUE,
  shopping_date date NOT NULL,
  status text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id text PRIMARY KEY,
  shopping_list_id text NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id text,
  display_name text NOT NULL,
  required_amount_value numeric(10, 3),
  required_amount_unit text,
  amount_note text,
  target_store_id text,
  status text NOT NULL,
  actual_price_amount numeric(10, 1),
  actual_store_id text,
  source text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_items_shopping_list_id_idx ON shopping_items (shopping_list_id);
```

## 3. マイグレーション生成

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: **`apps/web/src/db/migrations/`**（`apps/web/drizzle.config.ts` の `out` 設定。
  `packages/infrastructure/src/db/migrations/` では**ない**）。次の連番は `0006`
- 生成された `.sql` に `CREATE TABLE "shopping_lists"` / `CREATE TABLE "shopping_items"` と
  `shopping_lists` の `UNIQUE("meal_plan_id")` 相当の制約が含まれること
- `meta/_journal.json` に新エントリが追記され、既存 `0000`〜`0005` エントリは変更しないこと
- 既存 6 テーブルへの `ALTER` 文が含まれないこと
- 生成ファイルは**手動編集せず**そのままコミット対象とする

## 4. `DrizzleShoppingListRepository`（新規）

以下を**そのまま**実装する（実装計画 §Task 2 から転記。完全形）:

```typescript
import { and, eq, notInArray } from 'drizzle-orm';
import {
  ShoppingItem,
  ShoppingList,
  type ItemSource,
  type ItemStatus,
  type ShoppingListStatus,
} from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { DrizzleClient } from '../db/client';
import {
  shoppingItems,
  shoppingLists,
  type NewShoppingItemRow,
  type NewShoppingListRow,
  type ShoppingItemRow,
  type ShoppingListRow,
} from '../db/schema';
import { toUnit } from './mappers';

interface ShoppingListWithItemRow {
  shoppingList: ShoppingListRow;
  shoppingItem: ShoppingItemRow | null;
}

interface ShoppingListGroup {
  shoppingList: ShoppingListRow;
  items: ShoppingItemRow[];
}

export class DrizzleShoppingListRepository implements ShoppingListRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: ShoppingListId): Promise<ShoppingList | null> {
    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(eq(shoppingLists.id, id.value));

    if (rows.length === 0) return null;
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null> {
    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(eq(shoppingLists.mealPlanId, mealPlanId.value));

    if (rows.length === 0) return null;
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async save(shoppingList: ShoppingList): Promise<void> {
    const listRow = this.toShoppingListRow(shoppingList);
    await this.db
      .insert(shoppingLists)
      .values(listRow)
      .onConflictDoUpdate({
        target: shoppingLists.id,
        // mealPlanId/shoppingDate/createdAt は不変フィールドのため set 対象外
        set: { status: listRow.status },
      });

    const itemRows = this.toShoppingItemRows(shoppingList);
    const currentIds = itemRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db
        .delete(shoppingItems)
        .where(
          and(
            eq(shoppingItems.shoppingListId, shoppingList.id.value),
            notInArray(shoppingItems.id, currentIds),
          ),
        );
    } else {
      await this.db
        .delete(shoppingItems)
        .where(eq(shoppingItems.shoppingListId, shoppingList.id.value));
    }

    for (const row of itemRows) {
      await this.db
        .insert(shoppingItems)
        .values(row)
        .onConflictDoUpdate({
          target: shoppingItems.id,
          set: {
            displayName: row.displayName,
            requiredAmountValue: row.requiredAmountValue,
            requiredAmountUnit: row.requiredAmountUnit,
            amountNote: row.amountNote,
            targetStoreId: row.targetStoreId,
            status: row.status,
            actualPriceAmount: row.actualPriceAmount,
            actualStoreId: row.actualStoreId,
          },
        });
    }
  }

  private toShoppingLists(rows: ShoppingListWithItemRow[]): ShoppingList[] {
    const groups = new Map<string, ShoppingListGroup>();
    for (const row of rows) {
      let group = groups.get(row.shoppingList.id);
      if (group === undefined) {
        group = { shoppingList: row.shoppingList, items: [] };
        groups.set(row.shoppingList.id, group);
      }
      if (row.shoppingItem !== null) {
        group.items.push(row.shoppingItem);
      }
    }
    return [...groups.values()].map((group) => this.toEntity(group.shoppingList, group.items));
  }

  private toEntity(listRow: ShoppingListRow, itemRows: ShoppingItemRow[]): ShoppingList {
    return ShoppingList.reconstruct({
      id: ShoppingListId.fromString(listRow.id),
      mealPlanId: MealPlanId.fromString(listRow.mealPlanId),
      shoppingDate: toDate(listRow.shoppingDate),
      status: toShoppingListStatus(listRow.status),
      createdAt: listRow.createdAt,
      items: itemRows.map((row) =>
        ShoppingItem.reconstruct({
          id: ShoppingItemId.fromString(row.id),
          productId: row.productId === null ? null : ProductId.fromString(row.productId),
          displayName: row.displayName,
          requiredAmount:
            row.requiredAmountValue !== null && row.requiredAmountUnit !== null
              ? Quantity.of(Number(row.requiredAmountValue), toUnit(row.requiredAmountUnit))
              : null,
          amountNote: row.amountNote,
          targetStore: row.targetStoreId === null ? null : StoreId.fromString(row.targetStoreId),
          status: toItemStatus(row.status),
          actualPrice:
            row.actualPriceAmount === null ? null : Money.of(Number(row.actualPriceAmount), 'JPY'),
          actualStore: row.actualStoreId === null ? null : StoreId.fromString(row.actualStoreId),
          source: toItemSource(row.source),
        }),
      ),
    });
  }

  private toShoppingListRow(shoppingList: ShoppingList): NewShoppingListRow {
    return {
      id: shoppingList.id.value,
      mealPlanId: shoppingList.mealPlanId.value,
      shoppingDate: toDateString(shoppingList.shoppingDate),
      status: shoppingList.status,
      createdAt: shoppingList.createdAt,
    };
  }

  private toShoppingItemRows(shoppingList: ShoppingList): NewShoppingItemRow[] {
    return shoppingList.items.map((item) => ({
      id: item.id.value,
      shoppingListId: shoppingList.id.value,
      productId: item.productId?.value ?? null,
      displayName: item.displayName,
      requiredAmountValue: item.requiredAmount ? item.requiredAmount.value.toString() : null,
      requiredAmountUnit: item.requiredAmount?.unit ?? null,
      amountNote: item.amountNote,
      targetStoreId: item.targetStore?.value ?? null,
      status: item.status,
      actualPriceAmount: item.actualPrice ? item.actualPrice.amount.toString() : null,
      actualStoreId: item.actualStore?.value ?? null,
      source: item.source,
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

function toShoppingListStatus(value: string): ShoppingListStatus {
  switch (value) {
    case 'active':
    case 'completed':
      return value;
    default:
      throw new Error(`Unknown shopping list status: ${value}`);
  }
}

function toItemStatus(value: string): ItemStatus {
  switch (value) {
    case 'pending':
    case 'bought':
    case 'skipped':
      return value;
    default:
      throw new Error(`Unknown shopping item status: ${value}`);
  }
}

function toItemSource(value: string): ItemSource {
  switch (value) {
    case 'from_meal_plan':
    case 'manually_added':
      return value;
    default:
      throw new Error(`Unknown shopping item source: ${value}`);
  }
}
```

## 5. `infrastructure/src/index.ts` 追記

```typescript
export * from './repositories/drizzle-shopping-list.repository';
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- **テーブル名は複数形**: `shopping_lists` / `shopping_items`（単数形にしない）
- `numeric` カラムの読み出しは必ず `Number()` 変換（`requiredAmountValue`/`actualPriceAmount`。
  変換漏れは文字列のまま返り、テストで検知される）
- `date` 型カラム（`shoppingDate`）は必ず `'T00:00:00'` を付与してから `new Date()`。
  書き込みは `toDateString`（ローカル日付整形）を使う。**`toISOString().slice(...)` は禁止**
  （JST で前日にずれる）
- `save()` の `shopping_lists` upsert の `set` 対象は **`status` のみ**
- `shopping_items` の DELETE は `notInArray`（0 件時は全 DELETE）。
  `DrizzleMealPlanRepository.save()` と完全に同一パターン

## テスト（`drizzle-shopping-list.repository.test.ts`。PGlite 統合・`createTestDb()` 使用）

- `save()` → `findById()`: items 込みで正しく復元される（`mealPlanId`/`shoppingDate`/`status`/
  `items` 一致）
- 空 DB で `findById()`/`findByMealPlanId()` → `null`
- `findByMealPlanId()`: 保存済み `mealPlanId` で取得できる
- **nullability 全パターンの round-trip**: `requiredAmount` 非 null + `amountNote` null（通常材料）、
  `requiredAmount` null + `amountNote` 非 null（適量材料）、`productId`/`targetStoreId`/
  `actualPrice`/`actualStoreId` それぞれ null と非 null
- `meal_plan_id` の UNIQUE 制約違反（同一 `mealPlanId` で 2 つ目の `ShoppingList` を保存すると
  エラー）
- `save()` を同一 `id` で 2 回呼ぶと `shopping_lists` は 1 行のまま `status` のみ更新される
  （`mealPlanId`/`shoppingDate` は変化しない）
- item を削除した `ShoppingList` を再 `save()` すると `shopping_items` から該当行が DELETE される
  （`notInArray` の 0 件分岐を含む）
- `requiredAmountValue`/`actualPriceAmount` が `number` 型で復元される（文字列のまま返らない）
- `shoppingDate` の往復でタイムゾーンのズレがない（保存前後で `toDateString` 相当の値が一致）

## 完了条件

- [ ] `pnpm --filter @cookpit/infrastructure test` 全 green
- [ ] `pnpm --filter @cookpit/infrastructure type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `schema.ts`/`create-test-db.ts` に既存 6 テーブル分の変更がない
- [ ] `ShoppingListRepository` の 3 メソッドすべてが実装されている
- [ ] `save()` が `mealPlanId`/`shoppingDate`/`createdAt` を upsert の `set` に含めていない
- [ ] マイグレーションが `apps/web/src/db/migrations/` に生成され、既存マイグレーションに変更がない
