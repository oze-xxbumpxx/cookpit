import { Pantry, Stock, type StorageLocation } from '@cookpit/domain/src/pantry/pantry';
import { PantryId } from '@cookpit/domain/src/pantry/pantry-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { notInArray } from 'drizzle-orm';
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
