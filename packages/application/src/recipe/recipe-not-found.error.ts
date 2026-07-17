import { NotFoundError } from '../shared/errors';

export class RecipeNotFoundError extends NotFoundError {
  constructor(recipeId: string) {
    super('Recipe', recipeId);
  }
}
