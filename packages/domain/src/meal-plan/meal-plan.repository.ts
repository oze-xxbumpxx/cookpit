import type { WeekIdentifier } from '../shared/week-identifier';
import type { MealPlan } from './meal-plan';
import type { MealPlanId } from './meal-plan-id';

export interface MealPlanRepository {
  findById(id: MealPlanId): Promise<MealPlan | null>;
  findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null>;
  findRecent(limit: number): Promise<MealPlan[]>;
  save(mealPlan: MealPlan): Promise<void>;
}
