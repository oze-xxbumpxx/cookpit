'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { parseQuantity } from '@/lib/parse-quantity';
import { storageLocationSchema } from '@cookpit/api-contract';
import type { StorageLocation } from '@cookpit/application';
import { useId, useState } from 'react';
import { LOCATION_LABELS } from '../_utils/pantry-view';

const UNSET_LOCATION_VALUE = '';

const LOCATION_SELECT_OPTIONS: SelectFieldOption[] = [
  { value: UNSET_LOCATION_VALUE, label: '未設定' },
  ...storageLocationSchema.options.map((location) => ({
    value: location,
    label: LOCATION_LABELS[location],
  })),
];

function toStorageLocation(value: string): StorageLocation | null {
  return value === UNSET_LOCATION_VALUE ? null : (value as StorageLocation);
}

export interface AddStockFormInput {
  displayName: string;
  amount: { value: number; unit: string };
  storedLocation: StorageLocation | null;
  expiresAt: string | null;
}

interface Props {
  submitting: boolean;
  onAdd: (input: AddStockFormInput) => void;
}

/** 在庫の手動追加フォーム（展開パネル。add-item-form 同型）。 */
export function AddStockForm({ submitting, onAdd }: Props) {
  const displayNameId = useId();
  const amountId = useId();
  const locationId = useId();
  const expiresAtId = useId();

  const [displayName, setDisplayName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [location, setLocation] = useState(UNSET_LOCATION_VALUE);
  const [expiresAt, setExpiresAt] = useState('');

  const trimmedDisplayName = displayName.trim();
  const parsed = parseQuantity(amountText);
  const canSubmit =
    trimmedDisplayName !== '' && parsed.kind === 'amount' && parsed.value > 0 && !submitting;

  function handleAdd(): void {
    if (!canSubmit || parsed.kind !== 'amount') {
      return;
    }
    onAdd({
      displayName: trimmedDisplayName,
      amount: { value: parsed.value, unit: parsed.unit },
      storedLocation: toStorageLocation(location),
      expiresAt: expiresAt === '' ? null : expiresAt,
    });
    setDisplayName('');
    setAmountText('');
    setLocation(UNSET_LOCATION_VALUE);
    setExpiresAt('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-medium text-foreground">在庫を手動で追加</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor={displayNameId} className="text-sm font-medium text-foreground">
          品目名 <span className="text-xs font-normal text-destructive">必須</span>
        </label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          placeholder="例：玉ねぎ"
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={amountId} className="text-sm font-medium text-foreground">
          分量 <span className="text-xs font-normal text-destructive">必須</span>
          <span className="ml-1 text-xs font-normal text-muted-foreground">数量と単位</span>
        </label>
        <QuantityField id={amountId} value={amountText} onValueChange={setAmountText} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={locationId} className="text-sm font-medium text-foreground">
          保存場所 <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <SelectField
          id={locationId}
          value={location}
          onValueChange={setLocation}
          options={LOCATION_SELECT_OPTIONS}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={expiresAtId} className="text-sm font-medium text-foreground">
          賞味期限 <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <Input
          id={expiresAtId}
          type="date"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.currentTarget.value)}
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <Button type="button" onClick={handleAdd} disabled={!canSubmit} className="h-11 w-full">
        追加
      </Button>
    </div>
  );
}
