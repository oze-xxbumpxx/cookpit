import type { StockDto, StorageLocation } from '@cookpit/application';
import { LOCATION_LABELS, UNSET_LOCATION_LABEL } from '../_utils/pantry-view';
import { StockRow } from './stock-row';

interface Props {
  location: StorageLocation | null;
  stocks: StockDto[];
  asOf: Date;
  submittingStockId: string | null;
  highlightedStockId?: string | null;
  onEdit: (stock: StockDto) => void;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}

export function LocationGroup({
  location,
  stocks,
  asOf,
  submittingStockId,
  highlightedStockId = null,
  onEdit,
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
            asOf={asOf}
            submitting={submittingStockId === stock.id}
            highlighted={highlightedStockId === stock.id}
            onEdit={onEdit}
            onConsume={onConsume}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </section>
  );
}
