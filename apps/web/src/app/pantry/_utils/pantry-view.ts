import type { SelectFieldOption } from '@/components/ui/select-field';
import { storageLocationSchema } from '@cookpit/api-contract';
import type { StockDto, StorageLocation } from '@cookpit/application';

const LOCATION_ORDER: (StorageLocation | null)[] = ['fridge', 'freezer', 'pantry', null];

export const LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: '冷蔵',
  freezer: '冷凍',
  pantry: '常温',
};

export const UNSET_LOCATION_LABEL = '保存場所未設定';

/** 保存場所セレクトの「未設定」を表す値（`StorageLocation | null` の null 側）。 */
export const UNSET_LOCATION_VALUE = '';

export const LOCATION_SELECT_OPTIONS: SelectFieldOption[] = [
  { value: UNSET_LOCATION_VALUE, label: '未設定' },
  ...storageLocationSchema.options.map((location) => ({
    value: location,
    label: LOCATION_LABELS[location],
  })),
];

export function toStorageLocation(value: string): StorageLocation | null {
  return value === UNSET_LOCATION_VALUE ? null : (value as StorageLocation);
}

export interface StockLocationGroup {
  location: StorageLocation | null;
  label: string;
  stocks: StockDto[];
}

export function groupStocksByLocation(stocks: StockDto[]): StockLocationGroup[] {
  const groups: StockLocationGroup[] = [];

  for (const location of LOCATION_ORDER) {
    const locationStocks = stocks.filter((stock) => stock.storedLocation === location);
    if (locationStocks.length === 0) {
      continue;
    }

    groups.push({
      location,
      label: location === null ? UNSET_LOCATION_LABEL : LOCATION_LABELS[location],
      stocks: locationStocks,
    });
  }

  return groups;
}

export function formatExpiresAt(expiresAt: string): string {
  const parts = expiresAt.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return `${month}/${day}まで`;
}
