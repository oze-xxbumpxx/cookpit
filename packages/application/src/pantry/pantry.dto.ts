import type { Unit } from '@cookpit/domain/src/shared/unit';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface StockDto {
  id: string;
  productId: string | null;
  displayName: string;
  amount: { value: number; unit: Unit };
  purchasedAt: string;
  expiresAt: string | null;
  storedLocation: StorageLocation | null;
}

export interface PantryDto {
  stocks: StockDto[];
}

export interface ConsumeStockInputDto {
  stockId: string;
  amount: { value: number; unit: Unit };
}

export interface AddStockInputDto {
  displayName: string;
  amount: { value: number; unit: Unit };
  storedLocation: StorageLocation | null;
  /** ローカル日付文字列 `YYYY-MM-DD`。値なしは `null`。 */
  expiresAt: string | null;
}

export interface DiscardStockInputDto {
  stockId: string;
}
