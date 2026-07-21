'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { MealPlanDto, RecipeDto, ShoppingListDto } from '@cookpit/application';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildRecipeNameMap, formatWeekRange } from '../_utils/meal-plan-view';
import { PlannedRecipeItem } from './planned-recipe-item';
import { RecipePicker } from './recipe-picker';

interface Props {
  mealPlan: MealPlanDto | null;
  recipes: RecipeDto[];
  currentWeekIdentifier: string;
}

export function MealPlanClient({ mealPlan, recipes, currentWeekIdentifier }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 既存の作成・追加・削除フロー（submitting/errorMessage）とは独立させる（S-1）。
  const [shoppingListSubmitting, setShoppingListSubmitting] = useState(false);
  const [shoppingListErrorMessage, setShoppingListErrorMessage] = useState<string | null>(null);

  const recipeNameMap = buildRecipeNameMap(recipes);

  async function handleCreate(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api['meal-plans'].$post({
        json: { weekIdentifier: currentWeekIdentifier },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdd(recipeId: string, scaleFactor: number): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api['meal-plans'][':id'].recipes.$post({
        param: { id: mealPlan.id },
        json: { recipeId, scaleFactor },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(plannedRecipeId: string): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api['meal-plans'][':id'].recipes[':plannedRecipeId'].$delete({
        param: { id: mealPlan.id, plannedRecipeId },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShoppingList(): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    setShoppingListSubmitting(true);
    setShoppingListErrorMessage(null);
    try {
      const response = await client.api['shopping-lists'].$post({
        json: { mealPlanId: mealPlan.id },
      });
      if (!response.ok) {
        setShoppingListErrorMessage('操作に失敗しました。');
        return;
      }
      const result: ShoppingListDto = await response.json();
      router.push(`/shopping-lists/${result.id}`);
    } catch {
      setShoppingListErrorMessage('通信エラーが発生しました。');
    } finally {
      setShoppingListSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-foreground">今週の献立</h1>
          <Link
            href="/meal-plans/history"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-9 px-2 text-foreground',
            )}
          >
            履歴
          </Link>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {mealPlan === null ? (
          <section className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">今週の献立はまだありません</p>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="h-11 px-6"
            >
              {submitting ? '作成中' : '今週の献立をはじめる'}
            </Button>
          </section>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              {formatWeekRange(mealPlan.weekIdentifier)}
            </p>

            <Button
              type="button"
              onClick={() => void handleShoppingList()}
              disabled={shoppingListSubmitting}
              className="h-11 w-full"
            >
              {mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'}
            </Button>

            {shoppingListErrorMessage !== null && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {shoppingListErrorMessage}
              </p>
            )}

            <section aria-label="献立" className="flex flex-col gap-2">
              {mealPlan.plannedRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  レシピがまだ追加されていません
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mealPlan.plannedRecipes.map((plannedRecipe) => (
                    <li key={plannedRecipe.id}>
                      <PlannedRecipeItem
                        plannedRecipe={plannedRecipe}
                        recipeName={recipeNameMap.get(plannedRecipe.recipeId) ?? null}
                        onRemove={handleRemove}
                        submitting={submitting}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {pickerOpen ? (
              <RecipePicker recipes={recipes} onAdd={handleAdd} submitting={submitting} />
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPickerOpen(true)}
                className="h-11 w-full"
              >
                レシピを追加
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
