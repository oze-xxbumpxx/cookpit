export class PlannedRecipeNotFoundError extends Error {
  constructor(plannedRecipeId: string) {
    super(`PlannedRecipe not found: ${plannedRecipeId}`);
    this.name = 'PlannedRecipeNotFoundError';
  }
}
