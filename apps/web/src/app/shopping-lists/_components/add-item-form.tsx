'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { parseQuantity } from '@/lib/parse-quantity';
import type { StoreDto } from '@cookpit/application';
import { useId, useState } from 'react';

export interface AddItemFormInput {
  displayName: string;
  requiredAmount: { value: number; unit: string };
  targetStoreId: string | null;
}

interface Props {
  stores: StoreDto[];
  submitting: boolean;
  onAdd: (input: AddItemFormInput) => void;
}

const UNASSIGNED_STORE_VALUE = '';

/** 手動追加フォーム（展開パネル、recipe-picker 同型。D-5/D-6）。 */
export function AddItemForm({ stores, submitting, onAdd }: Props) {
  const displayNameId = useId();
  const amountId = useId();
  const targetStoreId = useId();

  const [displayName, setDisplayName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState(UNASSIGNED_STORE_VALUE);

  const storeOptions: SelectFieldOption[] = [
    { value: UNASSIGNED_STORE_VALUE, label: '店舗未定' },
    ...stores.map((store) => ({ value: store.id, label: store.name })),
  ];

  const trimmedDisplayName = displayName.trim();
  const parsed = parseQuantity(amountText);
  const canSubmit = trimmedDisplayName !== '' && parsed.kind === 'amount' && !submitting;

  function handleAdd(): void {
    if (!canSubmit || parsed.kind !== 'amount') {
      return;
    }
    onAdd({
      displayName: trimmedDisplayName,
      requiredAmount: { value: parsed.value, unit: parsed.unit },
      targetStoreId: selectedStoreId === UNASSIGNED_STORE_VALUE ? null : selectedStoreId,
    });
    setDisplayName('');
    setAmountText('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-medium text-foreground">手動で追加</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor={displayNameId} className="text-sm font-medium text-foreground">
          品目名 <span className="text-xs font-normal text-destructive">必須</span>
        </label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          placeholder="例：卵"
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={amountId} className="text-sm font-medium text-foreground">
          分量 <span className="text-xs font-normal text-muted-foreground">数量と単位</span>
        </label>
        <QuantityField id={amountId} value={amountText} onValueChange={setAmountText} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={targetStoreId} className="text-sm font-medium text-foreground">
          推奨店舗 <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <SelectField
          id={targetStoreId}
          value={selectedStoreId}
          onValueChange={setSelectedStoreId}
          options={storeOptions}
        />
      </div>

      <Button type="button" onClick={handleAdd} disabled={!canSubmit} className="h-11 w-full">
        追加
      </Button>
    </div>
  );
}
