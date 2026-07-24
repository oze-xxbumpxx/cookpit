'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UnitField } from '@/components/ui/unit-field';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

// 単位は自由記述（項目3）。空文字は「単位なし（分量メモ扱い）」を表す。
export type IngredientUnit = string;

export interface IngredientRowValue {
  id: string;
  displayName: string;
  amountText: string;
  amountUnit: string;
}

interface Props {
  value: IngredientRowValue;
  errorMessage: string | null;
  onChange: (next: IngredientRowValue) => void;
  onRemove: () => void;
}

export function IngredientRow({ value, errorMessage, onChange, onRemove }: Props) {
  const displayNameId = useId();
  const amountId = useId();
  const unitId = useId();
  const errorId = useId();

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, displayName: event.target.value });
  }

  function handleAmountTextChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, amountText: event.target.value });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(70px,0.85fr)_82px_36px] gap-2">
        <label htmlFor={displayNameId} className="sr-only">
          食材名
        </label>
        <Input
          id={displayNameId}
          value={value.displayName}
          onChange={handleDisplayNameChange}
          placeholder="食材名"
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 rounded-lg bg-card px-2 text-sm"
        />

        <label htmlFor={amountId} className="sr-only">
          量
        </label>
        <Input
          id={amountId}
          value={value.amountText}
          onChange={handleAmountTextChange}
          placeholder="量"
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 rounded-lg bg-card px-2 text-sm"
        />

        <label htmlFor={unitId} className="sr-only">
          単位
        </label>
        <UnitField
          id={unitId}
          value={value.amountUnit}
          onValueChange={(next) => onChange({ ...value, amountUnit: next })}
          placeholder="単位"
          className="h-11 w-full rounded-lg bg-card px-2 text-sm"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onRemove}
          aria-label="材料を削除"
          title="材料を削除"
          className="h-11 w-9 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {errorMessage !== null && (
        <p id={errorId} className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
