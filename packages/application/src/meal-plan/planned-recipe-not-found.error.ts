import { NotFoundError } from '../shared/errors';

export class PlannedRecipeNotFoundError extends NotFoundError {
  constructor(plannedRecipeId: string) {
    super('PlannedRecipe', plannedRecipeId);
  }
}
