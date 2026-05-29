import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { RecipeNotFoundError } from './recipe-not-found.error';

export class DeleteRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(id: string): Promise<void> {
    const recipeId = RecipeId.fromString(id);
    const recipe = await this.recipeRepository.findById(recipeId);
    if (recipe === null) {
      throw new RecipeNotFoundError(id);
    }

    await this.recipeRepository.delete(recipeId);
  }
}
