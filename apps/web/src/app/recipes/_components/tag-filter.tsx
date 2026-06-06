'use client';

import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import type { ReactNode } from 'react';

type RecipeTag = RecipeDto['tags'][number];

const TAG_OPTIONS = [
  '主菜',
  '副菜',
  '汁物',
  '作り置き向き',
  '冷凍可',
] as const satisfies readonly RecipeTag[];

export type TagFilterValue = 'all' | RecipeTag;

interface Props {
  value: TagFilterValue;
  onChange: (value: TagFilterValue) => void;
}

export function TagFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="レシピタグ">
      <Chip selected={value === 'all'} onClick={() => onChange('all')}>
        すべて
      </Chip>
      {TAG_OPTIONS.map((tag) => (
        <Chip key={tag} selected={value === tag} onClick={() => onChange(tag)}>
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors',
        selected
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
      )}
    >
      {children}
    </button>
  );
}
