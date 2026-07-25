import { RecipeId } from '@cookpit/domain';
import type { RecipeRepository } from '@cookpit/domain';
import type { RecipeDto } from './recipe.dto';
import { RecipeNotFoundError } from './recipe-not-found.error';
import { toRecipeDto } from './recipe.mapper';

export class GetRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(id: string): Promise<RecipeDto> {
    const recipeId = RecipeId.fromString(id);
    const recipe = await this.recipeRepository.findById(recipeId);
    if (recipe === null) {
      throw new RecipeNotFoundError(recipeId.value);
    }
    return toRecipeDto(recipe);
  }
}
