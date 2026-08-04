import {
  MealPlanId,
  Money,
  ProductId,
  Quantity,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
  StoreId,
} from '@cookpit/domain';
import type {
  ItemSource,
  ItemStatus,
  ShoppingListRepository,
  ShoppingListStatus,
} from '@cookpit/domain';
import { and, count, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db/client';
import {
  shoppingItems,
  shoppingLists,
  type NewShoppingItemRow,
  type NewShoppingListRow,
  type ShoppingItemRow,
  type ShoppingListRow,
} from '../db/schema';
import { toLocalDate, toLocalDateString, toUnit } from './mappers';

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

    if (rows.length === 0) {
      return null;
    }
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null> {
    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(eq(shoppingLists.mealPlanId, mealPlanId.value));

    if (rows.length === 0) {
      return null;
    }
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async save(shoppingList: ShoppingList): Promise<void> {
    const listRow = this.toShoppingListRow(shoppingList);
    await this.db
      .insert(shoppingLists)
      .values(listRow)
      .onConflictDoUpdate({
        target: shoppingLists.id,
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

    if (itemRows.length > 0) {
      // 配列バッチ upsert。set は各行の値を excluded.* で参照する。
      await this.db
        .insert(shoppingItems)
        .values(itemRows)
        .onConflictDoUpdate({
          target: shoppingItems.id,
          set: {
            displayName: sql`excluded.display_name`,
            requiredAmountValue: sql`excluded.required_amount_value`,
            requiredAmountUnit: sql`excluded.required_amount_unit`,
            amountNote: sql`excluded.amount_note`,
            targetStoreId: sql`excluded.target_store_id`,
            status: sql`excluded.status`,
            actualPriceAmount: sql`excluded.actual_price_amount`,
            actualStoreId: sql`excluded.actual_store_id`,
          },
        });
    }
  }

  async countItemsByStore(storeId: StoreId): Promise<number> {
    // 1 品目が targetStore と actualStore の両方で同じ店舗を指していても 1 件として数えたいので、
    // OR 条件の COUNT(*)（行数）にする。カラムごとに数えて足すと二重計上になる。
    const rows = await this.db
      .select({ value: count() })
      .from(shoppingItems)
      .where(
        or(
          eq(shoppingItems.targetStoreId, storeId.value),
          eq(shoppingItems.actualStoreId, storeId.value),
        ),
      );

    return rows[0]?.value ?? 0;
  }

  async findAllByStore(storeId: StoreId): Promise<ShoppingList[]> {
    // 該当リストを 1 クエリで丸ごと取得する。inArray のサブクエリで「該当品目を持つリスト」に
    // 絞り込んだうえで全品目を join するため、解除対象でない品目も含めて集約を完全に復元できる
    // （品目だけを絞って復元すると、save 時に残りの品目が消える）。
    const targetListIds = this.db
      .select({ id: shoppingItems.shoppingListId })
      .from(shoppingItems)
      .where(
        or(
          eq(shoppingItems.targetStoreId, storeId.value),
          eq(shoppingItems.actualStoreId, storeId.value),
        ),
      );

    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(inArray(shoppingLists.id, targetListIds));

    return this.toShoppingLists(rows);
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
      shoppingDate: toLocalDate(listRow.shoppingDate),
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
      shoppingDate: toLocalDateString(shoppingList.shoppingDate),
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
