'use client';

import type { CoveredIngredientDto } from '@cookpit/application';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  ingredients: CoveredIngredientDto[];
}

/**
 * 在庫全量カバー材料の折りたたみ節（P-1）。
 * StoreGroup ではない。チェック・楽観更新・オフラインキューの対象外。
 */
export function CoveredIngredientsSection({ ingredients }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (ingredients.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-foreground">在庫で足りる</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {ingredients.length}件
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <ul id={panelId} className="flex flex-col gap-2">
          {ingredients.map((ingredient) => (
            <li
              key={`${ingredient.productId}:${ingredient.displayName}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {ingredient.displayName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {ingredient.coveredAmount.value}
                {ingredient.coveredAmount.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
