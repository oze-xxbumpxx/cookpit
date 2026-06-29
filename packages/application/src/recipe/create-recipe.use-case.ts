import { Recipe } from '@cookpit/domain/src/recipe/recipe';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { CreateRecipeInputDto, RecipeDto } from './recipe.dto';
import { toIngredient, toRecipeDto, toStep } from './recipe.mapper';

export class CreateRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(input: CreateRecipeInputDto): Promise<RecipeDto> {
    const recipe = Recipe.create({
      name: input.name,
      ingredients: input.ingredients.map(toIngredient),
      steps: input.steps.map(toStep),
      baseServings: input.baseServings,
      tags: input.tags,
      cookingTime: input.cookingTime,
      notes: input.notes,
    });

    await this.recipeRepository.save(recipe);

    return toRecipeDto(recipe);
  }
}
