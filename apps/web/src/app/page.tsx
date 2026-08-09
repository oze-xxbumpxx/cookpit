import { GetCurrentMealPlanUseCase, GetPantryUseCase } from '@cookpit/application';
import { mealPlanRepository, pantryRepository } from '@/server/repositories';
import { Dashboard } from './_components/dashboard';
import { selectExpiringStocks } from './_utils/dashboard-view';
import { EXPIRY_URGENCY_WITHIN_DAYS } from './_utils/expiry';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const now = new Date();
  const [mealPlan, pantry] = await Promise.all([
    new GetCurrentMealPlanUseCase(mealPlanRepository()).execute(now),
    new GetPantryUseCase(pantryRepository()).execute(),
  ]);

  const expiringStocks = selectExpiringStocks(pantry.stocks, now, EXPIRY_URGENCY_WITHIN_DAYS);

  return <Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} asOf={now} />;
}
