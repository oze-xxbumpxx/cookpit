import { getDb } from '@/db/client';
import { GetCurrentMealPlanUseCase, GetRecipesUseCase } from '@cookpit/application';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { DrizzleMealPlanRepository, DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { MealPlanClient } from './_components/meal-plan-client';

export const dynamic = 'force-dynamic';

export default async function MealPlansPage() {
  const db = getDb();
  const mealPlanRepository = new DrizzleMealPlanRepository(db);
  const recipeRepository = new DrizzleRecipeRepository(db);

  const [mealPlan, recipes] = await Promise.all([
    new GetCurrentMealPlanUseCase(mealPlanRepository).execute(),
    new GetRecipesUseCase(recipeRepository).execute(),
  ]);

  const currentWeekIdentifier = WeekIdentifier.current().toString();

  return (
    <MealPlanClient
      mealPlan={mealPlan}
      recipes={recipes}
      currentWeekIdentifier={currentWeekIdentifier}
    />
  );
}
