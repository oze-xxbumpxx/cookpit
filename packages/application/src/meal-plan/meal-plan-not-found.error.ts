export class MealPlanNotFoundError extends Error {
  constructor(mealPlanId: string) {
    super(`MealPlan not found: ${mealPlanId}`);
    this.name = 'MealPlanNotFoundError';
  }
}
