export class RecipeNotFoundError extends Error {
  constructor(recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'RecipeNotFoundError';
  }
}
