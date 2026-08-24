'use client';

import type { CoveredIngredientDto } from '@cookpit/application';

interface Props {
  coveredIngredients: CoveredIngredientDto[];
}

/**
 * 在庫で必要量をすべてまかなった食材の折りたたみ表示（P-1）。
 * ShoppingItem ではないためチェック・楽観更新・オフラインキューの対象外。
 */
export function CoveredIngredientsSection({ coveredIngredients }: Props) {
  if (coveredIngredients.length === 0) {
    return null;
  }

  return (
    <details className="rounded-xl border border-border bg-muted/30 p-3">
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
        在庫で足りる（{coveredIngredients.length}）
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {coveredIngredients.map((ingredient) => (
          <li
            key={`${ingredient.productId}|${ingredient.requiredAmount.unit}`}
            className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground"
          >
            <span className="min-w-0 truncate">{ingredient.displayName}</span>
            <span className="shrink-0 tabular-nums">
              {ingredient.requiredAmount.value}
              {ingredient.requiredAmount.unit}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
