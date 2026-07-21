import { GetCurrentMealPlanUseCase, GetPantryUseCase } from '@cookpit/application';
import { mealPlanRepository, pantryRepository } from '@/server/repositories';
import { Dashboard } from './_components/dashboard';
import { selectExpiringStocks } from './_utils/dashboard-view';

export const dynamic = 'force-dynamic';

const EXPIRY_WITHIN_DAYS = 3;

export default async function Home() {
  const now = new Date();
  const [mealPlan, pantry] = await Promise.all([
    new GetCurrentMealPlanUseCase(mealPlanRepository()).execute(now),
    new GetPantryUseCase(pantryRepository()).execute(),
  ]);

  const expiringStocks = selectExpiringStocks(pantry.stocks, now, EXPIRY_WITHIN_DAYS);

  return <Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} asOf={now} />;
}
