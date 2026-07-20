import type { StockDto, StorageLocation } from '@cookpit/application';
import { LOCATION_LABELS, UNSET_LOCATION_LABEL } from '../_utils/pantry-view';
import { StockRow } from './stock-row';

interface Props {
  location: StorageLocation | null;
  stocks: StockDto[];
  submittingStockId: string | null;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}

export function LocationGroup({
  location,
  stocks,
  submittingStockId,
  onConsume,
  onDiscard,
}: Props) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">
        {location === null ? UNSET_LOCATION_LABEL : LOCATION_LABELS[location]}
      </h2>
      <ul className="flex flex-col gap-2">
        {stocks.map((stock) => (
          <StockRow
            key={stock.id}
            stock={stock}
            submitting={submittingStockId === stock.id}
            onConsume={onConsume}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </section>
  );
}
