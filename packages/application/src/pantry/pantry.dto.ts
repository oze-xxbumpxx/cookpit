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

export interface DiscardStockInputDto {
  stockId: string;
}
