import { Button } from '@/components/ui/button';
import type { StockDto } from '@cookpit/application';
import { formatExpiresAt } from '../_utils/pantry-view';

interface Props {
  stock: StockDto;
  submitting: boolean;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}

export function StockRow({ stock, submitting, onConsume, onDiscard }: Props) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-foreground">{stock.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {stock.amount.value}
          {stock.amount.unit}
        </p>
        {stock.expiresAt !== null && (
          <p className="text-xs text-muted-foreground">〜{formatExpiresAt(stock.expiresAt)}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onConsume(stock.id)}
          disabled={submitting}
        >
          使った
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => onDiscard(stock.id)}
          disabled={submitting}
        >
          捨てた
        </Button>
      </div>
    </li>
  );
}
