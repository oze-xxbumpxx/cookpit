import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { RecipeDto } from './recipe.dto';
import { toRecipeDto } from './recipe.mapper';

export class GetRecipesUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(): Promise<RecipeDto[]> {
    const recipes = await this.recipeRepository.findAll();
    return recipes.map(toRecipeDto);
  }
}
