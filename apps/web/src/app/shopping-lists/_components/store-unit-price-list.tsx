import type { StoreUnitPriceEntry } from '../_utils/price-comparison';
import { formatYen } from '../_utils/price-comparison';

interface Props {
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

/** 店舗別単価の内訳リスト（bought/未 bought 両方から使う共有コンポーネント）。 */
export function StoreUnitPriceList({ basisLabel, entries }: Props) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li key={entry.storeId} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-foreground">{entry.storeName}</span>
          <span className="shrink-0 text-muted-foreground">
            {formatYen(entry.unitPriceAmount)} / {basisLabel}
          </span>
          <span className="shrink-0 font-medium text-foreground">
            {entry.isCheapest ? '← 最安' : `+${entry.diffFromCheapestYen}円`}
          </span>
        </li>
      ))}
    </ul>
  );
}
