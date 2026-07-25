import { GetCurrentMealPlanUseCase } from '@cookpit/application';
import { mealPlanRepository } from '@/server/repositories';
import { ShoppingListEntryClient } from './_components/shopping-list-entry-client';

export const dynamic = 'force-dynamic';

export default async function ShoppingListsPage() {
  const mealPlan = await new GetCurrentMealPlanUseCase(mealPlanRepository()).execute();

  return <ShoppingListEntryClient mealPlan={mealPlan} />;
}
