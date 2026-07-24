import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { Store } from 'lucide-react';
import { ShoppingItemRow } from './shopping-item-row';

interface Props {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemDto[];
  expandedItemId: string | null;
  submittingItemId: string | null;
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
  stores: StoreDto[];
}

/** 店舗ごとのグループ（ヘッダー + item 一覧。D-2/S-6 案A）。 */
export function StoreGroup({
  storeId,
  storeName,
  items,
  expandedItemId,
  submittingItemId,
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
  stores,
}: Props) {
  const boughtCount = items.filter((item) => item.status === 'bought').length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{storeId === null ? '店舗未定' : storeName}</span>
        </h2>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          {boughtCount}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            stores={stores}
            expanded={item.id === expandedItemId}
            submitting={item.id === submittingItemId}
            onToggleExpand={onToggleExpand}
            onSetChecked={onSetChecked}
            onMarkAsBought={onMarkAsBought}
            onReassignStore={onReassignStore}
          />
        ))}
      </ul>
    </section>
  );
}
