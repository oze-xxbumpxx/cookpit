import type { MealPlanStatus } from './meal-plan.dto';

export class InvalidMealPlanStateError extends Error {
  constructor(current: MealPlanStatus, operation: string) {
    super(`Cannot ${operation} a MealPlan with status '${current}'`);
    this.name = 'InvalidMealPlanStateError';
  }
}
