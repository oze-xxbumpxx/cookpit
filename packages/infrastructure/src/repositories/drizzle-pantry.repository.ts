import {
  Pantry,
  PantryId,
  ProductId,
  Quantity,
  ShoppingItemId,
  Stock,
  StockId,
} from '@cookpit/domain';
import type { PantryRepository, StorageLocation } from '@cookpit/domain';
import { notInArray, sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db/client';
import { stocks, type NewStockRow, type StockRow } from '../db/schema';
import { toLocalDate, toLocalDateString, toUnit } from './mappers';
import type { DrizzleUnitOfWork } from '../uow/drizzle-unit-of-work';

export class DrizzlePantryRepository implements PantryRepository {
  constructor(private readonly unitOfWork: DrizzleUnitOfWork) {}

  private get db(): DrizzleClient {
    return this.unitOfWork.client;
  }

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

    if (stockRows.length > 0) {
      // 配列バッチ upsert。set は各行の値を excluded.* で参照する。
      // 編集可能なのは amount（値・単位）/ expiresAt / storedLocation の 4 列のみ
      // （stock-edit の P-1 で確定）。displayName / purchasedAt / productId /
      // sourceShoppingItemId は編集対象外なので意図的に含めない。
      await this.db
        .insert(stocks)
        .values(stockRows)
        .onConflictDoUpdate({
          target: stocks.id,
          set: {
            amountValue: sql`excluded.amount_value`,
            amountUnit: sql`excluded.amount_unit`,
            expiresAt: sql`excluded.expires_at`,
            storedLocation: sql`excluded.stored_location`,
          },
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
      expiresAt: row.expiresAt === null ? null : toLocalDate(row.expiresAt),
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
      expiresAt: stock.expiresAt === null ? null : toLocalDateString(stock.expiresAt),
      storedLocation: stock.storedLocation,
      sourceShoppingItemId: stock.sourceShoppingItemId?.value ?? null,
    }));
  }
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
