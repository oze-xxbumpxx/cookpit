import { InvalidStateError } from '../shared/errors';
import type { MealPlanStatus } from './meal-plan.dto';

export class InvalidMealPlanStateError extends InvalidStateError {
  constructor(current: MealPlanStatus, operation: string) {
    super('MealPlan', current, operation);
  }
}
