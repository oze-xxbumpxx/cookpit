import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { RecipeDto, UpdateRecipeInputDto } from './recipe.dto';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { RecipeNotFoundError } from './recipe-not-found.error';
import { toIngredient, toRecipeDto, toStep } from './recipe.mapper';

export class UpdateRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(input: UpdateRecipeInputDto): Promise<RecipeDto> {
    const recipe = await this.recipeRepository.findById(RecipeId.fromString(input.id));
    if (recipe === null) {
      throw new RecipeNotFoundError(input.id);
    }

    recipe.rename(input.name);
    recipe.updateIngredients(input.ingredients.map(toIngredient));
    recipe.updateSteps(input.steps.map(toStep));
    recipe.updateTags(input.tags);
    recipe.updateCookingTime(input.cookingTime);
    recipe.updateNotes(input.notes);
    recipe.updateServings(input.servings ?? null);

    await this.recipeRepository.save(recipe);

    return toRecipeDto(recipe);
  }
}
