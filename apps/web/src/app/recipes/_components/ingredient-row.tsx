'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
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
  /** 0 始まりの表示位置。ドラッグハンドルの読み上げに使う。 */
  index: number;
  errorMessage: string | null;
  onChange: (next: IngredientRowValue) => void;
  onRemove: () => void;
}

/** 食材名が空の行でも並べ替えハンドルを特定できるよう、位置で代替する。 */
function resolveHandleLabel(displayName: string, index: number): string {
  const trimmed = displayName.trim();
  return trimmed === '' ? `${index + 1}番目の材料を並べ替え` : `「${trimmed}」を並べ替え`;
}

export function IngredientRow({ value, index, errorMessage, onChange, onRemove }: Props) {
  const displayNameId = useId();
  const amountId = useId();
  const errorId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: value.id,
  });

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, displayName: event.target.value });
  }

  return (
    <div
      ref={setNodeRef}
      // 横方向の追従を捨てて縦 1 次元に固定する（@dnd-kit/modifiers を足さずに済ませる）。
      style={{
        transform:
          transform === null
            ? undefined
            : CSS.Transform.toString({ ...transform, x: 0, scaleX: 1, scaleY: 1 }),
        transition,
      }}
      className={
        isDragging ? 'relative z-10 flex flex-col gap-1.5 opacity-90' : 'flex flex-col gap-1.5'
      }
    >
      <div className="grid grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_36px] gap-2">
        {/* touch-none はハンドルにだけ当てる。行全体に当てるとリストの縦スクロールが死ぬ。 */}
        <button
          type="button"
          aria-label={resolveHandleLabel(value.displayName, index)}
          title="ドラッグまたは Space キーで並べ替え"
          className="flex h-11 w-7 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>

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
