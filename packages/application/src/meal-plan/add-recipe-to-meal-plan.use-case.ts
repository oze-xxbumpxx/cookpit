import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { PlannedRecipeId } from '@cookpit/domain/src/meal-plan/planned-recipe-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { InvalidMealPlanStateError } from './invalid-meal-plan-state.error';
import type { AddRecipeToMealPlanInputDto, PlannedRecipeDto } from './meal-plan.dto';
import { toPlannedRecipeDto } from './meal-plan.mapper';
import { MealPlanNotFoundError } from './meal-plan-not-found.error';

export class AddRecipeToMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: AddRecipeToMealPlanInputDto): Promise<PlannedRecipeDto> {
    const mealPlan = await this.mealPlanRepository.findById(
      MealPlanId.fromString(input.mealPlanId),
    );
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(input.mealPlanId);
    }

    let plannedRecipeId: PlannedRecipeId;
    try {
      plannedRecipeId = mealPlan.addRecipe(RecipeId.fromString(input.recipeId), input.scaleFactor);
    } catch (error) {
      if (input.scaleFactor <= 0) {
        throw error;
      }
      throw new InvalidMealPlanStateError(mealPlan.status, 'addRecipe');
    }

    await this.mealPlanRepository.save(mealPlan);

    const plannedRecipe =
      mealPlan.plannedRecipes.find((recipe) => recipe.id.equals(plannedRecipeId)) ?? null;
    if (plannedRecipe === null) {
      throw new Error('Added PlannedRecipe not found');
    }

    return toPlannedRecipeDto(plannedRecipe);
  }
}
