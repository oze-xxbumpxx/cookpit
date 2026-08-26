import {
  GetMealPlanByWeekUseCase,
  GetRecipesUseCase,
  resolveMealPlanWeekQuery,
} from '@cookpit/application';
import { mealPlanRepository, recipeRepository } from '@/server/repositories';
import { MealPlanClient } from './_components/meal-plan-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function MealPlansPage({ searchParams }: Props) {
  const { week } = await searchParams;
  const {
    currentWeekIdentifier,
    selectedWeekIdentifier,
    previousWeekIdentifier,
    nextWeekIdentifier,
  } = resolveMealPlanWeekQuery(week);

  const [mealPlan, recipes] = await Promise.all([
    new GetMealPlanByWeekUseCase(mealPlanRepository()).execute(selectedWeekIdentifier),
    new GetRecipesUseCase(recipeRepository()).execute(),
  ]);

  return (
    <MealPlanClient
      mealPlan={mealPlan}
      recipes={recipes}
      currentWeekIdentifier={currentWeekIdentifier}
      selectedWeekIdentifier={selectedWeekIdentifier}
      previousWeekIdentifier={previousWeekIdentifier}
      nextWeekIdentifier={nextWeekIdentifier}
    />
  );
}
