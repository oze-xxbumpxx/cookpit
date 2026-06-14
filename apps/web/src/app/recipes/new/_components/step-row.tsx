'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
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

export function StepRow({ index, value, onChange, onRemove }: Props) {
  const descriptionId = useId();

  function handleDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange({ ...value, description: event.target.value });
  }

  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_36px] gap-2">
      <div
        className="flex h-11 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-700"
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
        className="min-h-20 rounded-lg bg-white text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={onRemove}
        aria-label="手順を削除"
        title="手順を削除"
        className="h-11 w-9 rounded-lg text-zinc-500 hover:text-zinc-900"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
