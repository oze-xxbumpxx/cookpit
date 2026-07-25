'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { useId, useState } from 'react';

interface Props {
  item: ShoppingItemDto;
  stores: StoreDto[];
  submitting: boolean;
  onSubmit: (actualPrice: number, actualStoreId: string) => void;
  onCancel: () => void;
}

/** 購入実績入力のインライン展開フォーム（D-5）。 */
export function PurchaseInputForm({ item, stores, submitting, onSubmit, onCancel }: Props) {
  const priceId = useId();
  const storeId = useId();

  const [priceInput, setPriceInput] = useState(
    item.actualPrice !== null ? String(item.actualPrice.amount) : '',
  );
  const [selectedStoreId, setSelectedStoreId] = useState(
    item.actualStoreId ?? item.targetStoreId ?? '',
  );

  const storeOptions: SelectFieldOption[] = stores.map((store) => ({
    value: store.id,
    label: store.name,
  }));

  const trimmedPrice = priceInput.trim();
  const parsedPrice = Number(trimmedPrice);
  const canSubmit =
    selectedStoreId !== '' &&
    trimmedPrice !== '' &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0 &&
    !submitting;

  function handleSubmit(): void {
    if (!canSubmit) {
      return;
    }
    onSubmit(parsedPrice, selectedStoreId);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      {item.status === 'bought' && (
        <p className="text-xs text-muted-foreground">
          金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={priceId} className="text-sm font-medium text-foreground">
            価格
          </label>
          <Input
            id={priceId}
            type="number"
            min={0}
            inputMode="numeric"
            value={priceInput}
            onChange={(event) => setPriceInput(event.currentTarget.value)}
            placeholder="198"
            className="h-11 rounded-xl bg-background"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={storeId} className="text-sm font-medium text-foreground">
            実購入店舗
          </label>
          <SelectField
            id={storeId}
            value={selectedStoreId}
            onValueChange={setSelectedStoreId}
            options={storeOptions}
            placeholder="店舗を選択"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="h-10 flex-1">
          購入を記録
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-10 flex-1">
          キャンセル
        </Button>
      </div>
    </div>
  );
}
