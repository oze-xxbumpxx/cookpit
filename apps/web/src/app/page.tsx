import { GetCurrentMealPlanUseCase, GetExpiringStocksUseCase } from '@cookpit/application';
import { mealPlanRepository, pantryRepository } from '@/server/repositories';
import { Dashboard } from './_components/dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const now = new Date();
  const [mealPlan, expiringStocks] = await Promise.all([
    new GetCurrentMealPlanUseCase(mealPlanRepository()).execute(now),
    new GetExpiringStocksUseCase(pantryRepository()).execute(now),
  ]);

  return <Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} asOf={now} />;
}
