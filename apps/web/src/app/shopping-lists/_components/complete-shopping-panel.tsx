'use client';

import {
  LOCATION_SELECT_OPTIONS,
  UNSET_LOCATION_VALUE,
  toStorageLocation,
} from '@/app/pantry/_utils/pantry-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField } from '@/components/ui/select-field';
import { parseQuantity } from '@/lib/parse-quantity';
import { cn } from '@/lib/utils';
import type { ShoppingItemDto, StockAdditionInputDto } from '@cookpit/application';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';

interface RowState {
  checked: boolean;
  amountText: string;
  storedLocation: string;
  expiresAt: string;
  expiresAtExpanded: boolean;
}

interface Props {
  /** 在庫化の候補（bought 品目のみを渡す）。 */
  items: ShoppingItemDto[];
  submitting: boolean;
  onCancel: () => void;
  onComplete: (stockAdditions: StockAdditionInputDto[]) => void;
}

/** 数量が「値＋単位」に分解でき、値が正のときだけ在庫化できる。 */
function isAmountValid(amountText: string): boolean {
  const parsed = parseQuantity(amountText);
  return parsed.kind === 'amount' && parsed.value > 0;
}

/**
 * 実際に在庫化されるか。`checked`（ユーザーの選択の意思）は数量の編集で書き換えず、
 * 有効性との論理積で判定する。こうしないと数量を消して打ち直す操作で選択が落ちたままになる。
 */
function isRowSelected(row: RowState): boolean {
  return row.checked && isAmountValid(row.amountText);
}

function initialRows(items: ShoppingItemDto[]): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const item of items) {
    // 数量が「適量」等（amountNote）の品目は在庫の数量を決められないため、空・未選択で始める。
    const amountText =
      item.requiredAmount === null ? '' : `${item.requiredAmount.value}${item.requiredAmount.unit}`;
    rows[item.id] = {
      checked: isAmountValid(amountText),
      amountText,
      storedLocation: UNSET_LOCATION_VALUE,
      expiresAt: '',
      expiresAtExpanded: false,
    };
  }
  return rows;
}

/**
 * 買い物完了時に、購入した品目のうち在庫へ追加するものを選ぶパネル。
 * 賞味期限は必要な品目だけ行ごとに任意入力できる。
 */
export function CompleteShoppingPanel({ items, submitting, onCancel, onComplete }: Props) {
  const headingId = useId();
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(items));

  function updateRow(itemId: string, patch: Partial<RowState>): void {
    setRows((current) => {
      const row = current[itemId];
      if (row === undefined) {
        return current;
      }
      return { ...current, [itemId]: { ...row, ...patch } };
    });
  }

  function handleToggleAll(nextChecked: boolean): void {
    setRows((current) => {
      const next: Record<string, RowState> = {};
      for (const [itemId, row] of Object.entries(current)) {
        next[itemId] = { ...row, checked: nextChecked };
      }
      return next;
    });
  }

  function handleComplete(): void {
    const additions: StockAdditionInputDto[] = [];
    for (const item of items) {
      const row = rows[item.id];
      if (row === undefined || !isRowSelected(row)) {
        continue;
      }
      const parsed = parseQuantity(row.amountText);
      if (parsed.kind !== 'amount' || parsed.value <= 0) {
        continue;
      }
      additions.push({
        itemId: item.id,
        amount: { value: parsed.value, unit: parsed.unit },
        storedLocation: toStorageLocation(row.storedLocation),
        expiresAt: row.expiresAt === '' ? null : row.expiresAt,
      });
    }
    onComplete(additions);
  }

  // 一括切替の向きは「選択できる行」だけで決める。数量が無い行を数に入れると、
  // 選択可能な行が全部 ON でもボタンが「すべて選択」のまま切り替わらなくなる。
  const selectableRows = items
    .map((item) => rows[item.id])
    .filter((row): row is RowState => row !== undefined && isAmountValid(row.amountText));
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => row.checked);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-medium text-foreground">
          在庫に追加する品目
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleToggleAll(!allSelected)}
          className="h-9 px-2 text-foreground"
        >
          {allSelected ? 'すべて解除' : 'すべて選択'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        選んだ品目が在庫に追加されます。数量は必要に応じて修正できます。
      </p>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const row = rows[item.id];
          if (row === undefined) {
            return null;
          }

          return (
            <StockAdditionRow
              key={item.id}
              item={item}
              amountText={row.amountText}
              storedLocation={row.storedLocation}
              expiresAt={row.expiresAt}
              expiresAtExpanded={row.expiresAtExpanded}
              checked={isRowSelected(row)}
              amountValid={isAmountValid(row.amountText)}
              disabled={submitting}
              onToggle={() => updateRow(item.id, { checked: !isRowSelected(row) })}
              onAmountChange={(amountText) => updateRow(item.id, { amountText })}
              onLocationChange={(storedLocation) => updateRow(item.id, { storedLocation })}
              onExpiresAtChange={(expiresAt) => updateRow(item.id, { expiresAt })}
              onExpiresAtExpandedChange={(expiresAtExpanded) =>
                updateRow(item.id, {
                  expiresAt: expiresAtExpanded ? row.expiresAt : '',
                  expiresAtExpanded,
                })
              }
            />
          );
        })}
      </ul>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="h-11 min-w-0 flex-1"
        >
          キャンセル
        </Button>
        <Button
          type="button"
          onClick={handleComplete}
          disabled={submitting}
          className="h-11 min-w-0 flex-1"
        >
          完了する
        </Button>
      </div>
    </section>
  );
}

interface RowProps {
  item: ShoppingItemDto;
  amountText: string;
  storedLocation: string;
  expiresAt: string;
  expiresAtExpanded: boolean;
  checked: boolean;
  amountValid: boolean;
  disabled: boolean;
  onToggle: () => void;
  onAmountChange: (amountText: string) => void;
  onLocationChange: (storedLocation: string) => void;
  onExpiresAtChange: (expiresAt: string) => void;
  onExpiresAtExpandedChange: (expanded: boolean) => void;
}

function StockAdditionRow({
  item,
  amountText,
  storedLocation,
  expiresAt,
  expiresAtExpanded,
  checked,
  amountValid,
  disabled,
  onToggle,
  onAmountChange,
  onLocationChange,
  onExpiresAtChange,
  onExpiresAtExpandedChange,
}: RowProps) {
  const amountId = useId();
  const locationId = useId();
  const expiresAtId = useId();
  const hintId = useId();

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={
            checked ? `${item.displayName}を在庫に追加しない` : `${item.displayName}を在庫に追加`
          }
          onClick={onToggle}
          disabled={disabled || !amountValid}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors active:scale-[0.98]',
            checked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background',
            !amountValid && 'opacity-50',
          )}
        >
          {checked && <Check className="size-4" aria-hidden="true" />}
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {item.displayName}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,7rem)] gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={amountId} className="text-xs text-muted-foreground">
            数量
          </label>
          <QuantityField
            id={amountId}
            value={amountText}
            onValueChange={onAmountChange}
            invalid={!amountValid}
            describedBy={amountValid ? undefined : hintId}
            className="h-11 rounded-xl bg-background"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={locationId} className="text-xs text-muted-foreground">
            保存場所
          </label>
          <SelectField
            id={locationId}
            value={storedLocation}
            onValueChange={onLocationChange}
            options={LOCATION_SELECT_OPTIONS}
            disabled={disabled}
            className="h-11"
          />
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expiresAtExpanded}
        onClick={() => onExpiresAtExpandedChange(!expiresAtExpanded)}
        disabled={disabled}
        className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
      >
        {expiresAtExpanded ? '賞味期限を削除' : '賞味期限を設定'}
      </button>

      {expiresAtExpanded && (
        <div className="flex flex-col gap-1">
          <label htmlFor={expiresAtId} className="text-xs text-muted-foreground">
            賞味期限
          </label>
          <Input
            id={expiresAtId}
            type="date"
            value={expiresAt}
            onChange={(event) => onExpiresAtChange(event.currentTarget.value)}
            disabled={disabled}
            className="h-11 rounded-xl bg-background"
          />
        </div>
      )}

      {!amountValid && (
        <p id={hintId} className="text-xs text-muted-foreground">
          数量と単位を入力すると在庫に追加できます（例：3個）
        </p>
      )}
    </li>
  );
}
