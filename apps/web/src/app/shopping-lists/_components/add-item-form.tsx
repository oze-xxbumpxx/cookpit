'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { unitSchema } from '@cookpit/api-contract';
import type { StoreDto } from '@cookpit/application';
import { useId, useState } from 'react';

export const UNIT_OPTIONS = unitSchema.options;
type ShoppingUnit = (typeof UNIT_OPTIONS)[number];

const UNIT_SELECT_OPTIONS: SelectFieldOption[] = UNIT_OPTIONS.map((unit) => ({
  value: unit,
  label: unit,
}));

function toShoppingUnit(value: string): ShoppingUnit {
  return UNIT_OPTIONS.find((option) => option === value) ?? UNIT_OPTIONS[0];
}

export interface AddItemFormInput {
  displayName: string;
  requiredAmount: { value: number; unit: ShoppingUnit };
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
  const valueId = useId();
  const unitId = useId();
  const targetStoreId = useId();

  const [displayName, setDisplayName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<ShoppingUnit>(UNIT_OPTIONS[0]);
  const [selectedStoreId, setSelectedStoreId] = useState(UNASSIGNED_STORE_VALUE);

  const storeOptions: SelectFieldOption[] = [
    { value: UNASSIGNED_STORE_VALUE, label: '店舗未定' },
    ...stores.map((store) => ({ value: store.id, label: store.name })),
  ];

  const trimmedDisplayName = displayName.trim();
  const trimmedValue = value.trim();
  const parsedValue = Number(trimmedValue);
  const canSubmit =
    trimmedDisplayName !== '' &&
    trimmedValue !== '' &&
    Number.isFinite(parsedValue) &&
    parsedValue >= 0 &&
    !submitting;

  function handleAdd(): void {
    if (!canSubmit) {
      return;
    }
    onAdd({
      displayName: trimmedDisplayName,
      requiredAmount: { value: parsedValue, unit },
      targetStoreId: selectedStoreId === UNASSIGNED_STORE_VALUE ? null : selectedStoreId,
    });
    setDisplayName('');
    setValue('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-medium text-foreground">手動で追加</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor={displayNameId} className="text-sm font-medium text-foreground">
          品目名 <span className="text-xs font-normal text-red-600">必須</span>
        </label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          placeholder="例：卵"
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={valueId} className="text-sm font-medium text-foreground">
            数量
          </label>
          <Input
            id={valueId}
            type="number"
            min={0}
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder="1"
            className="h-11 rounded-xl bg-background"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={unitId} className="text-sm font-medium text-foreground">
            単位
          </label>
          <SelectField
            id={unitId}
            value={unit}
            onValueChange={(nextValue) => setUnit(toShoppingUnit(nextValue))}
            options={UNIT_SELECT_OPTIONS}
          />
        </div>
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
