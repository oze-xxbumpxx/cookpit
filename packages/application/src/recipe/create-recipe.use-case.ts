import { Recipe } from '@cookpit/domain';
import type { UnitOfWork, RecipeRepository } from '@cookpit/domain';
import type { CreateRecipeInputDto, RecipeDto } from './recipe.dto';
import { toIngredient, toRecipeDto, toStep } from './recipe.mapper';

export class CreateRecipeUseCase {
  constructor(
    private readonly recipeRepository: RecipeRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: CreateRecipeInputDto): Promise<RecipeDto> {
    return this.unitOfWork.execute(async () => {
      const recipe = Recipe.create({
        name: input.name,
        ingredients: input.ingredients.map(toIngredient),
        steps: input.steps.map(toStep),
        baseServings: input.baseServings,
        tags: input.tags,
        cookingTime: input.cookingTime,
        notes: input.notes,
        servings: input.servings ?? null,
      });

      await this.recipeRepository.save(recipe);

      return toRecipeDto(recipe);
    });
  }
}
