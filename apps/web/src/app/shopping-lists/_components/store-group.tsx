import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { ShoppingItemRow } from './shopping-item-row';

interface Props {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemDto[];
  expandedItemId: string | null;
  submittingItemId: string | null;
  onToggleExpand: (itemId: string) => void;
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
  onMarkAsBought,
  onReassignStore,
  stores,
}: Props) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">
        {storeId === null ? '店舗未定' : storeName}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            stores={stores}
            expanded={item.id === expandedItemId}
            submitting={item.id === submittingItemId}
            onToggleExpand={onToggleExpand}
            onMarkAsBought={onMarkAsBought}
            onReassignStore={onReassignStore}
          />
        ))}
      </ul>
    </section>
  );
}
