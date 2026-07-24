'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export interface IngredientRowValue {
  id: string;
  displayName: string;
  // 分量（数量+単位を 1 欄に統合）。数値+単位は amount、数値で始まらない入力は分量メモ扱い（要望2）。
  amountText: string;
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
  const errorId = useId();

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, displayName: event.target.value });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_36px] gap-2">
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
          分量
        </label>
        <QuantityField
          id={amountId}
          value={value.amountText}
          onValueChange={(next) => onChange({ ...value, amountText: next })}
          placeholder="例：300g / 少々"
          className="h-11 w-full rounded-lg bg-card px-2 text-sm"
          invalid={errorMessage !== null}
          describedBy={errorMessage === null ? undefined : errorId}
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
