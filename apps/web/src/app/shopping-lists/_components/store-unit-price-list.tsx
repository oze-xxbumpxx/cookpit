import type { StoreUnitPriceEntry } from '../_utils/price-comparison';
import { formatStoreUnitPriceDiffLabel, formatYen } from '../_utils/price-comparison';

interface Props {
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

/** 店舗別単価の内訳リスト（bought/未 bought 両方から使う共有コンポーネント）。 */
export function StoreUnitPriceList({ basisLabel, entries }: Props) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li
          key={entry.storeId}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5 text-xs"
        >
          {/* 3 列横並びだと 390px で折り返して崩れる。差額は右列の 2 行目へ落とす。 */}
          <span className="min-w-0 truncate text-foreground">{entry.storeName}</span>
          <span className="shrink-0 text-muted-foreground">
            {formatYen(entry.unitPriceAmount)} / {basisLabel}
          </span>
          <span className="col-start-2 shrink-0 font-medium text-foreground">
            {formatStoreUnitPriceDiffLabel(entry)}
          </span>
        </li>
      ))}
    </ul>
  );
}
