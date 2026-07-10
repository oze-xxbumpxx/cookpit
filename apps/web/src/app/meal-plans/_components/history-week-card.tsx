import { cn } from '@/lib/utils';
import type { MealPlanDto } from '@cookpit/application';
import { formatWeekRange } from '../_utils/meal-plan-view';

interface Props {
  mealPlan: MealPlanDto;
  recipeNameMap: Map<string, string>;
  isCurrentWeek: boolean;
}

export function HistoryWeekCard({ mealPlan, recipeNameMap, isCurrentWeek }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">
          {formatWeekRange(mealPlan.weekIdentifier)}
        </p>
        {isCurrentWeek && (
          <span
            className={cn(
              'rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground',
            )}
          >
            今週
          </span>
        )}
      </div>

      {mealPlan.plannedRecipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">レシピなし</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {mealPlan.plannedRecipes.map((plannedRecipe) => {
            const recipeName = recipeNameMap.get(plannedRecipe.recipeId) ?? null;
            return (
              <li key={plannedRecipe.id} className="flex items-center gap-2 text-sm">
                {recipeName !== null ? (
                  <span className="min-w-0 truncate text-foreground">{recipeName}</span>
                ) : (
                  <span className="min-w-0 truncate text-muted-foreground">削除済みレシピ</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {plannedRecipe.scaleFactor}×
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
