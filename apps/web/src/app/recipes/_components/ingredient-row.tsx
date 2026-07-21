'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CreateRecipeBody } from '@cookpit/api-contract';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export type IngredientUnit = NonNullable<CreateRecipeBody['ingredients'][number]['amountUnit']>;

export interface IngredientRowValue {
  id: string;
  displayName: string;
  amountText: string;
  amountUnit: IngredientUnit | '';
}

interface Props {
  value: IngredientRowValue;
  errorMessage: string | null;
  onChange: (next: IngredientRowValue) => void;
  onRemove: () => void;
  unitOptions: readonly IngredientUnit[];
}

function isIngredientUnit(
  value: string,
  unitOptions: readonly IngredientUnit[],
): value is IngredientUnit {
  return unitOptions.some((unit) => unit === value);
}

export function IngredientRow({ value, errorMessage, onChange, onRemove, unitOptions }: Props) {
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

  function handleAmountUnitChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextValue = event.target.value;
    onChange({
      ...value,
      amountUnit: isIngredientUnit(nextValue, unitOptions) ? nextValue : '',
    });
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
        <select
          id={unitId}
          value={value.amountUnit}
          onChange={handleAmountUnitChange}
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        >
          <option value="">単位</option>
          {unitOptions.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>

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
