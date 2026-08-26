import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GetMealPlanHistoryUseCase,
  GetRecipesUseCase,
  currentWeekIdentifier,
} from '@cookpit/application';
import { mealPlanRepository, recipeRepository } from '@/server/repositories';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/app/_components/empty-state';
import { HistoryWeekCard } from '../_components/history-week-card';
import { buildRecipeNameMap, resolveHistoryLimit } from '../_utils/meal-plan-view';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ limit?: string }>;
}

export default async function MealPlanHistoryPage({ searchParams }: Props) {
  const { limit: rawLimit } = await searchParams;
  const limit = resolveHistoryLimit(rawLimit);

  const [mealPlans, recipes] = await Promise.all([
    new GetMealPlanHistoryUseCase(mealPlanRepository()).execute({ limit }),
    new GetRecipesUseCase(recipeRepository()).execute(),
  ]);

  const recipeNameMap = buildRecipeNameMap(recipes);
  const currentWeek = currentWeekIdentifier();

  const showMoreLimit = Math.min(limit + 4, 12);
  const canShowMore = mealPlans.length === limit && limit < 12;

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex justify-start">
            <Link
              href="/meal-plans"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9 px-2')}
            >
              戻る
            </Link>
          </div>
          <h1 className="min-w-0 truncate text-center text-xl font-semibold text-foreground">
            献立の履歴
          </h1>
          <div />
        </header>

        {mealPlans.length === 0 ? (
          <EmptyState Icon={CalendarDays} message="履歴はまだありません" />
        ) : (
          <ul className="flex flex-col gap-3">
            {mealPlans.map((mealPlan) => (
              <li key={mealPlan.id}>
                <HistoryWeekCard
                  mealPlan={mealPlan}
                  recipeNameMap={recipeNameMap}
                  isCurrentWeek={mealPlan.weekIdentifier === currentWeek}
                />
              </li>
            ))}
          </ul>
        )}

        {canShowMore && (
          <Link
            href={`/meal-plans/history?limit=${showMoreLimit}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-10 w-full')}
          >
            さらに表示
          </Link>
        )}
      </div>
    </main>
  );
}
