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
import { and, eq, notInArray, sql } from 'drizzle-orm';
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
