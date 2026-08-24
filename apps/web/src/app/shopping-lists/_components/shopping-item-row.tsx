'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import type { ProductDto, ShoppingItemDto, StoreDto } from '@cookpit/application';
import { Check, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import {
  buildStoreUnitPriceBreakdown,
  estimateItemPriceDiff,
  formatEstimatedDiffMessage,
} from '../_utils/price-comparison';
import { PurchaseInputForm } from './purchase-input-form';
import { StoreUnitPriceList } from './store-unit-price-list';

interface Props {
  item: ShoppingItemDto;
  stores: StoreDto[];
  expanded: boolean;
  submitting: boolean;
  /**
   * 買い物リストが completed のとき true。サーバーは completed のリストへの
   * チェック・金額記録・店舗再割当をすべて 422 で拒否するため、UI 側でも操作させない。
   */
  readOnly: boolean;
  /** true のとき、この品目はオフラインキューに積まれ未送信であることを示す（P-6）。 */
  unsynced: boolean;
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
  /** 削除の確認を親に要求する（削除そのものは親が確認ダイアログを挟んで実行する）。 */
  onRequestRemove: (itemId: string) => void;
  productMap: Map<string, ProductDto>;
}

function resolveStoreName(storeId: string | null, stores: StoreDto[]): string {
  if (storeId === null) {
    return '店舗未定';
  }
  return stores.find((store) => store.id === storeId)?.name ?? '不明な店舗';
}

/** item 1 行（チェック・表示・展開トグル・店舗変更。D-4）。 */
export function ShoppingItemRow({
  item,
  stores,
  expanded,
  submitting,
  readOnly,
  unsynced,
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
  onRequestRemove,
  productMap,
}: Props) {
  const storeSelectId = useId();
  const [storeEditing, setStoreEditing] = useState(false);

  const bought = item.status === 'bought';
  const locked = submitting || readOnly;
  const storeOptions: SelectFieldOption[] = stores.map((store) => ({
    value: store.id,
    label: store.name,
  }));

  const product = item.productId !== null ? productMap.get(item.productId) : undefined;
  const priceDiff = estimateItemPriceDiff(item, product);
  const breakdown = buildStoreUnitPriceBreakdown(product);
  const hasBreakdown = breakdown !== null;

  function handleReassign(nextStoreId: string): void {
    setStoreEditing(false);
    if (nextStoreId === '') {
      return;
    }
    onReassignStore(item.id, nextStoreId);
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border p-3 transition-colors',
        bought ? 'bg-muted/40' : 'bg-card',
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={bought}
          aria-label={
            bought ? `${item.displayName}のチェックを外す` : `${item.displayName}をチェックする`
          }
          onClick={() => onSetChecked(item.id, !bought)}
          disabled={locked}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors active:scale-[0.98]',
            bought
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background',
          )}
        >
          {bought && <Check className="size-4" aria-hidden="true" />}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={cn(
              'truncate text-sm font-medium',
              bought ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          >
            {item.displayName}
          </p>
          {unsynced && <span className="text-[10px] text-muted-foreground">未送信</span>}
          <p className="text-xs text-muted-foreground">
            {item.requiredAmount !== null
              ? `${item.requiredAmount.value}${item.requiredAmount.unit}`
              : item.amountNote}
          </p>
          {item.pantryDeductedAmount !== null && (
            <p className="text-xs text-muted-foreground">
              在庫で {item.pantryDeductedAmount.value}
              {item.pantryDeductedAmount.unit}
            </p>
          )}
          {priceDiff !== null && (
            <p className="text-xs break-words text-muted-foreground">
              {formatEstimatedDiffMessage(priceDiff)}
            </p>
          )}
          {bought && item.actualPrice !== null && (
            <p className="text-xs text-muted-foreground">
              ✓ {resolveStoreName(item.actualStoreId, stores)} で ¥{item.actualPrice.amount} 購入
            </p>
          )}
          {(bought || hasBreakdown) && !readOnly && (
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              disabled={submitting}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {bought ? '金額を記録' : '店舗別の単価を見る'}
            </button>
          )}
        </div>

        {storeEditing ? (
          <div className="w-28 min-w-0">
            <label htmlFor={storeSelectId} className="sr-only">
              推奨店舗を変更
            </label>
            <SelectField
              id={storeSelectId}
              value={item.targetStoreId ?? ''}
              onValueChange={handleReassign}
              options={storeOptions}
              disabled={locked}
              className="h-9"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStoreEditing(true)}
            disabled={locked}
            title={resolveStoreName(item.targetStoreId, stores)}
            className="min-w-0 max-w-[7rem] shrink-0 truncate rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {resolveStoreName(item.targetStoreId, stores)}
          </button>
        )}

        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRequestRemove(item.id)}
            disabled={locked}
            aria-label={`${item.displayName}を削除`}
            title="この品目を削除"
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {expanded &&
        (bought ? (
          <PurchaseInputForm
            item={item}
            stores={stores}
            submitting={submitting}
            breakdown={breakdown}
            onSubmit={(actualPrice, actualStoreId) =>
              onMarkAsBought(item.id, actualPrice, actualStoreId)
            }
            onCancel={() => onToggleExpand(item.id)}
          />
        ) : (
          breakdown !== null && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <StoreUnitPriceList basisLabel={breakdown.basisLabel} entries={breakdown.entries} />
            </div>
          )
        ))}
    </li>
  );
}
