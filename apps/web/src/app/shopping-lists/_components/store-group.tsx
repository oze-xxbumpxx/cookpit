import type { ProductDto, ShoppingItemDto, StoreDto } from '@cookpit/application';
import { Store } from 'lucide-react';
import { ShoppingItemRow } from './shopping-item-row';

interface Props {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemDto[];
  expandedItemId: string | null;
  submittingItemId: string | null;
  /** 買い物リストが completed のとき true。各行を読み取り専用にする。 */
  readOnly: boolean;
  /** 現在キューに残っている itemId の集合（P-6）。 */
  pendingItemIds: ReadonlySet<string>;
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
  /** 削除の確認を親に要求する。中継漏れを型で検出するため必須にする。 */
  onRequestRemove: (itemId: string) => void;
  stores: StoreDto[];
  productMap: Map<string, ProductDto>;
}

/** 店舗ごとのグループ（ヘッダー + item 一覧。D-2/S-6 案A）。 */
export function StoreGroup({
  storeId,
  storeName,
  items,
  expandedItemId,
  submittingItemId,
  readOnly,
  pendingItemIds,
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
  onRequestRemove,
  stores,
  productMap,
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
            readOnly={readOnly}
            unsynced={pendingItemIds.has(item.id)}
            onToggleExpand={onToggleExpand}
            onSetChecked={onSetChecked}
            onMarkAsBought={onMarkAsBought}
            onReassignStore={onReassignStore}
            onRequestRemove={onRequestRemove}
            productMap={productMap}
          />
        ))}
      </ul>
    </section>
  );
}
