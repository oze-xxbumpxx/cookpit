import type { Pantry, Stock } from '@cookpit/domain';
import { toLocalDateString } from '../shared/date';
import type { PantryDto, StockDto } from './pantry.dto';

export function toStockDto(stock: Stock): StockDto {
  return {
    id: stock.id.value,
    productId: stock.productId?.value ?? null,
    displayName: stock.displayName,
    amount: { value: stock.amount.value, unit: stock.amount.unit },
    purchasedAt: stock.purchasedAt.toISOString(),
    expiresAt: stock.expiresAt === null ? null : toLocalDateString(stock.expiresAt),
    storedLocation: stock.storedLocation,
  };
}

export function toPantryDto(pantry: Pantry): PantryDto {
  return { stocks: pantry.stocks.map(toStockDto) };
}
