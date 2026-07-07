import type { MealPlan, PlannedRecipe } from '@cookpit/domain/src/meal-plan/meal-plan';
import type { MealPlanDto, PlannedRecipeDto } from './meal-plan.dto';

export function toMealPlanDto(mealPlan: MealPlan): MealPlanDto {
  return {
    id: mealPlan.id.value,
    weekIdentifier: mealPlan.weekOf.toString(),
    status: mealPlan.status,
    plannedRecipes: mealPlan.plannedRecipes.map(toPlannedRecipeDto),
    createdAt: mealPlan.createdAt.toISOString(),
    completedAt: mealPlan.completedAt?.toISOString() ?? null,
  };
}

export function toPlannedRecipeDto(plannedRecipe: PlannedRecipe): PlannedRecipeDto {
  return {
    id: plannedRecipe.id.value,
    recipeId: plannedRecipe.recipeId.value,
    scaleFactor: plannedRecipe.scaleFactor,
    scheduledDate: plannedRecipe.scheduledDate?.toISOString().slice(0, 10) ?? null,
    cookedAt: plannedRecipe.cookedAt?.toISOString() ?? null,
    notes: plannedRecipe.notes,
  };
}
