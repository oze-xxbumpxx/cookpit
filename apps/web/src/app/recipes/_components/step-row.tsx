'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export interface StepRowValue {
  id: string;
  description: string;
}

interface Props {
  index: number;
  value: StepRowValue;
  onChange: (next: StepRowValue) => void;
  onRemove: () => void;
}

/** 手順文が空の行でも並べ替えハンドルを特定できるよう、位置で代替する。 */
function resolveHandleLabel(description: string, index: number): string {
  const trimmed = description.trim();
  return trimmed === '' ? `${index + 1}番目の手順を並べ替え` : `「${trimmed}」を並べ替え`;
}

export function StepRow({ index, value, onChange, onRemove }: Props) {
  const descriptionId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: value.id,
  });

  function handleDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange({ ...value, description: event.target.value });
  }

  return (
    <div
      ref={setNodeRef}
      // 横方向の追従を捨てて縦 1 次元に固定する（材料行と同じ）。
      style={{
        transform:
          transform === null
            ? undefined
            : CSS.Transform.toString({ ...transform, x: 0, scaleX: 1, scaleY: 1 }),
        transition,
      }}
      className={isDragging ? 'relative z-10 grid opacity-90' : 'grid'}
    >
      <div className="grid grid-cols-[28px_28px_minmax(0,1fr)_36px] gap-2">
        {/* touch-none はハンドルにだけ当てる。行全体に当てるとリストの縦スクロールが死ぬ。 */}
        <button
          type="button"
          aria-label={resolveHandleLabel(value.description, index)}
          title="ドラッグまたは Space キーで並べ替え"
          className="flex h-11 w-7 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <div
          className="flex h-11 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground"
          aria-hidden="true"
        >
          {index + 1}
        </div>
        <label htmlFor={descriptionId} className="sr-only">
          手順 {index + 1}
        </label>
        <Textarea
          id={descriptionId}
          value={value.description}
          onChange={handleDescriptionChange}
          placeholder="手順を入力"
          className="min-h-20 rounded-lg bg-card text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onRemove}
          aria-label="手順を削除"
          title="手順を削除"
          className="h-11 w-9 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
