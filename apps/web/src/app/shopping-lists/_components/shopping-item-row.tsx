'use client';

import { cn } from '@/lib/utils';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { PurchaseInputForm } from './purchase-input-form';

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
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
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
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
}: Props) {
  const storeSelectId = useId();
  const [storeEditing, setStoreEditing] = useState(false);

  const bought = item.status === 'bought';
  const locked = submitting || readOnly;
  const storeOptions: SelectFieldOption[] = stores.map((store) => ({
    value: store.id,
    label: store.name,
  }));

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
          <p className="text-xs text-muted-foreground">
            {item.requiredAmount !== null
              ? `${item.requiredAmount.value}${item.requiredAmount.unit}`
              : item.amountNote}
          </p>
          {bought && item.actualPrice !== null && (
            <p className="text-xs text-muted-foreground">
              ✓ {resolveStoreName(item.actualStoreId, stores)} で ¥{item.actualPrice.amount} 購入
            </p>
          )}
          {bought && !readOnly && (
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              disabled={submitting}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              金額を記録
            </button>
          )}
        </div>

        {storeEditing ? (
          <div className="w-28">
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
            className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {resolveStoreName(item.targetStoreId, stores)}
          </button>
        )}
      </div>

      {bought && expanded && (
        <PurchaseInputForm
          item={item}
          stores={stores}
          submitting={submitting}
          onSubmit={(actualPrice, actualStoreId) =>
            onMarkAsBought(item.id, actualPrice, actualStoreId)
          }
          onCancel={() => onToggleExpand(item.id)}
        />
      )}
    </li>
  );
}
