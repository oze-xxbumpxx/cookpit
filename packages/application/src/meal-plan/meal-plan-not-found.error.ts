import { NotFoundError } from '../shared/errors';

export class MealPlanNotFoundError extends NotFoundError {
  constructor(mealPlanId: string) {
    super('MealPlan', mealPlanId);
  }
}
