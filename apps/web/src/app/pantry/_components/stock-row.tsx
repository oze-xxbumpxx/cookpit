import { expiryUrgencyChipClass } from '@/app/_utils/category-color';
import {
  EXPIRY_URGENCY_WITHIN_DAYS,
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@/app/_utils/expiry';
import type { ExpiryUrgency } from '@/app/_utils/expiry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StockDto } from '@cookpit/application';
import { Pencil, Trash2, Utensils } from 'lucide-react';
import { LOCATION_LABELS, UNSET_LOCATION_LABEL, formatExpiresAt } from '../_utils/pantry-view';

interface Props {
  stock: StockDto;
  asOf: Date;
  submitting: boolean;
  onEdit: (stock: StockDto) => void;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}

export function StockRow({ stock, asOf, submitting, onEdit, onConsume, onDiscard }: Props) {
  const remainingDays =
    stock.expiresAt === null ? null : getExpiryRemainingDays(stock.expiresAt, asOf);
  const urgency: ExpiryUrgency | null =
    remainingDays !== null && remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS
      ? getExpiryUrgency(remainingDays)
      : null;
  const locationLabel =
    stock.storedLocation === null ? UNSET_LOCATION_LABEL : LOCATION_LABELS[stock.storedLocation];

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-foreground">{stock.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {stock.amount.value}
          {stock.amount.unit}
        </p>
        <p className="text-xs text-muted-foreground">保存場所: {locationLabel}</p>
        {stock.expiresAt !== null && (
          <p className="text-xs text-muted-foreground">〜{formatExpiresAt(stock.expiresAt)}</p>
        )}
        {urgency !== null && remainingDays !== null && (
          <span
            className={cn(
              'w-fit rounded-full px-2 py-0.5 text-xs font-medium',
              expiryUrgencyChipClass(urgency),
            )}
          >
            {formatExpiryUrgencyLabel(remainingDays)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onEdit(stock)} disabled={submitting}>
          <Pencil aria-hidden="true" />
          編集
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onConsume(stock.id)}
          disabled={submitting}
        >
          <Utensils aria-hidden="true" />
          消費
        </Button>
        {/*
          取り消せない操作のため色の手がかりは残すが、塗りの赤（destructive）はやめて
          文字色だけに弱める。赤の塗りはこのアプリでは本当に危険な操作のために取っておく。
        */}
        <Button
          type="button"
          variant="outline"
          onClick={() => onDiscard(stock.id)}
          disabled={submitting}
          className="text-destructive/80 hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          廃棄
        </Button>
      </div>
    </li>
  );
}
