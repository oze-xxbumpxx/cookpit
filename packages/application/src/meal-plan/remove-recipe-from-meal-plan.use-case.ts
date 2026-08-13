import { MealPlanId, PlannedRecipeId } from '@cookpit/domain';
import type { UnitOfWork, MealPlanRepository } from '@cookpit/domain';
import { InvalidMealPlanStateError } from './invalid-meal-plan-state.error';
import type { RemoveRecipeFromMealPlanInputDto } from './meal-plan.dto';
import { MealPlanNotFoundError } from './meal-plan-not-found.error';
import { PlannedRecipeNotFoundError } from './planned-recipe-not-found.error';

export class RemoveRecipeFromMealPlanUseCase {
  constructor(
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: RemoveRecipeFromMealPlanInputDto): Promise<void> {
    return this.unitOfWork.execute(async () => {
      const mealPlan = await this.mealPlanRepository.findById(
        MealPlanId.fromString(input.mealPlanId),
      );
      if (mealPlan === null) {
        throw new MealPlanNotFoundError(input.mealPlanId);
      }

      const plannedRecipeId = PlannedRecipeId.fromString(input.plannedRecipeId);
      const exists = mealPlan.plannedRecipes.some((recipe) => recipe.id.equals(plannedRecipeId));
      if (!exists) {
        throw new PlannedRecipeNotFoundError(input.plannedRecipeId);
      }

      if (mealPlan.status === 'completed') {
        throw new InvalidMealPlanStateError(mealPlan.status, 'removeRecipe');
      }

      mealPlan.removeRecipe(plannedRecipeId);

      await this.mealPlanRepository.save(mealPlan);
    });
  }
}
