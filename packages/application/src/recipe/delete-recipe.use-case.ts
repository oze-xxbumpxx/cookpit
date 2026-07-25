import { RecipeId } from '@cookpit/domain';
import type { RecipeRepository } from '@cookpit/domain';
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
