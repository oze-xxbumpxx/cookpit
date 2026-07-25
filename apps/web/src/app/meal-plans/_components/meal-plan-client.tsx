'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useApiAction } from '@/lib/use-api-action';
import type { MealPlanDto, RecipeDto } from '@cookpit/application';
import { EmptyState } from '@/app/_components/empty-state';
import { mealPlanStatusChipClass } from '@/app/_utils/category-color';
import { MEAL_PLAN_STATUS_LABELS } from '@/app/_utils/dashboard-view';
import { CalendarDays, ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  buildRecipeNameMap,
  canEditPlannedRecipes,
  formatWeekRange,
} from '../_utils/meal-plan-view';
import { PlannedRecipeItem } from './planned-recipe-item';
import { RecipePicker } from './recipe-picker';

interface Props {
  mealPlan: MealPlanDto | null;
  recipes: RecipeDto[];
  currentWeekIdentifier: string;
  /** 表示・作成対象の週。未指定時は現在週として扱う（後方互換）。 */
  selectedWeekIdentifier?: string;
  /** 週ナビ用。previous と next が揃うときのみ週送りリンクを描画する。 */
  previousWeekIdentifier?: string;
  nextWeekIdentifier?: string;
}

export function MealPlanClient({
  mealPlan,
  recipes,
  currentWeekIdentifier,
  selectedWeekIdentifier,
  previousWeekIdentifier,
  nextWeekIdentifier,
}: Props) {
  const router = useRouter();
  const selectedWeek = selectedWeekIdentifier ?? currentWeekIdentifier;
  const isCurrentWeek = selectedWeek === currentWeekIdentifier;
  const showWeekNav = previousWeekIdentifier !== undefined && nextWeekIdentifier !== undefined;
  const weekNavLabel = isCurrentWeek
    ? `今週 ${formatWeekRange(selectedWeek)}`
    : formatWeekRange(selectedWeek);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 献立の作成・レシピ追加・削除は実行中フラグとエラーバナーを共有する。
  const planAction = useApiAction();
  // 買い物リスト作成は上記とは独立させる（S-1）。
  const shoppingListAction = useApiAction();

  const recipeNameMap = buildRecipeNameMap(recipes);
  // 買い物完了後（cooking 以降）はサーバーがレシピの追加・削除を 422 で拒否するため、
  // その状態では編集 UI（追加ボタン・削除ボタン）を出さない。
  const canEditRecipes = mealPlan !== null && canEditPlannedRecipes(mealPlan.status);

  async function handleCreate(): Promise<void> {
    await planAction.run(
      () => client.api['meal-plans'].$post({ json: { weekIdentifier: selectedWeek } }),
      { onSuccessWithoutBody: () => router.refresh() },
    );
  }

  async function handleAdd(recipeId: string, scaleFactor: number): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    await planAction.run(
      () =>
        client.api['meal-plans'][':id'].recipes.$post({
          param: { id: mealPlan.id },
          json: { recipeId, scaleFactor },
        }),
      { onSuccessWithoutBody: () => router.refresh() },
    );
  }

  async function handleRemove(plannedRecipeId: string): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    await planAction.run(
      () =>
        client.api['meal-plans'][':id'].recipes[':plannedRecipeId'].$delete({
          param: { id: mealPlan.id, plannedRecipeId },
        }),
      { onSuccessWithoutBody: () => router.refresh() },
    );
  }

  async function handleShoppingList(): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    await shoppingListAction.run(
      () => client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } }),
      { onSuccess: (result) => router.push(`/shopping-lists/${result.id}`) },
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-foreground">献立</h1>
            <Link
              href="/meal-plans/history"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-9 px-2 text-foreground',
              )}
            >
              履歴
            </Link>
          </div>
          {showWeekNav && (
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/meal-plans?week=${previousWeekIdentifier}`}
                aria-label="前の週"
                className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
              <span className="text-sm font-medium text-foreground">{weekNavLabel}</span>
              <Link
                href={`/meal-plans?week=${nextWeekIdentifier}`}
                aria-label="次の週"
                className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </header>

        {planAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {planAction.errorMessage}
          </p>
        )}

        {mealPlan === null ? (
          <EmptyState
            Icon={CalendarDays}
            message={
              isCurrentWeek
                ? '今週の献立はまだありません'
                : `${formatWeekRange(selectedWeek)}の献立はまだありません`
            }
          >
            <Button
              type="button"
              onClick={handleCreate}
              disabled={planAction.pending}
              className="h-11 px-6"
            >
              {planAction.pending
                ? '作成中'
                : isCurrentWeek
                  ? '今週の献立を作る'
                  : 'この週の献立を作る'}
            </Button>
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {formatWeekRange(mealPlan.weekIdentifier)}
              </p>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  mealPlanStatusChipClass(mealPlan.status),
                )}
              >
                {MEAL_PLAN_STATUS_LABELS[mealPlan.status]}
              </span>
            </div>

            <Button
              type="button"
              onClick={() => void handleShoppingList()}
              disabled={shoppingListAction.pending}
              className="h-11 w-full"
            >
              {mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'}
            </Button>

            {shoppingListAction.errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {shoppingListAction.errorMessage}
              </p>
            )}

            <section aria-label="献立" className="flex flex-col gap-2">
              {mealPlan.plannedRecipes.length === 0 ? (
                <EmptyState Icon={Utensils} message="レシピがまだ追加されていません" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {mealPlan.plannedRecipes.map((plannedRecipe) => (
                    <li key={plannedRecipe.id}>
                      <PlannedRecipeItem
                        plannedRecipe={plannedRecipe}
                        recipeName={recipeNameMap.get(plannedRecipe.recipeId) ?? null}
                        onRemove={handleRemove}
                        submitting={planAction.pending}
                        canEdit={canEditRecipes}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canEditRecipes ? (
              pickerOpen ? (
                <RecipePicker recipes={recipes} onAdd={handleAdd} submitting={planAction.pending} />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  className="h-11 w-full"
                >
                  レシピを追加
                </Button>
              )
            ) : (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
                完了した献立はレシピを追加・削除できません
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
