import { getDb } from '@/db/client';
import { GetMealPlanByWeekUseCase, GetRecipesUseCase } from '@cookpit/application';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { DrizzleMealPlanRepository, DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { MealPlanClient } from './_components/meal-plan-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ week?: string }>;
}

// `?week=` は YYYY-MM-DD 形式かつ有効日付のときのみ採用し、非土曜は WeekIdentifier が土曜へ
// スナップする。形式不正・無効日付・未指定は現在週にフォールバックする（500 を避ける）。
function resolveSelectedWeek(raw: string | undefined): WeekIdentifier {
  if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return WeekIdentifier.current();
  }
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return WeekIdentifier.current();
  }
  return WeekIdentifier.fromDate(date);
}

export default async function MealPlansPage({ searchParams }: Props) {
  const { week } = await searchParams;
  const selectedWeek = resolveSelectedWeek(week);
  const selectedWeekIdentifier = selectedWeek.toString();

  const db = getDb();
  const mealPlanRepository = new DrizzleMealPlanRepository(db);
  const recipeRepository = new DrizzleRecipeRepository(db);

  const [mealPlan, recipes] = await Promise.all([
    new GetMealPlanByWeekUseCase(mealPlanRepository).execute(selectedWeekIdentifier),
    new GetRecipesUseCase(recipeRepository).execute(),
  ]);

  return (
    <MealPlanClient
      mealPlan={mealPlan}
      recipes={recipes}
      currentWeekIdentifier={WeekIdentifier.current().toString()}
      selectedWeekIdentifier={selectedWeekIdentifier}
      previousWeekIdentifier={selectedWeek.previous().toString()}
      nextWeekIdentifier={selectedWeek.next().toString()}
    />
  );
}
