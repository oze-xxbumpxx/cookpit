import type { Pantry, Stock } from '@cookpit/domain/src/pantry/pantry';
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

// UTC 変換による日付ずれを避け、ローカル日付のまま境界外へ渡す。
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
