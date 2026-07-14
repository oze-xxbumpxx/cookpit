import { getDb } from '@/db/client';
import { GetCurrentMealPlanUseCase } from '@cookpit/application';
import { DrizzleMealPlanRepository } from '@cookpit/infrastructure';
import { ShoppingListEntryClient } from './_components/shopping-list-entry-client';

export const dynamic = 'force-dynamic';

export default async function ShoppingListsPage() {
  const mealPlanRepository = new DrizzleMealPlanRepository(getDb());
  const mealPlan = await new GetCurrentMealPlanUseCase(mealPlanRepository).execute();

  return <ShoppingListEntryClient mealPlan={mealPlan} />;
}
