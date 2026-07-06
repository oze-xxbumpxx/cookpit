export type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';

export interface PlannedRecipeDto {
  id: string;
  recipeId: string;
  scaleFactor: number;
  scheduledDate: string | null;
  cookedAt: string | null;
  notes: string;
}

export interface MealPlanDto {
  id: string;
  weekIdentifier: string;
  status: MealPlanStatus;
  plannedRecipes: PlannedRecipeDto[];
  createdAt: string;
  completedAt: string | null;
}

export interface CreateMealPlanInputDto {
  weekIdentifier: string;
}

export interface AddRecipeToMealPlanInputDto {
  mealPlanId: string;
  recipeId: string;
  scaleFactor: number;
}

export interface RemoveRecipeFromMealPlanInputDto {
  mealPlanId: string;
  plannedRecipeId: string;
}

export interface GetMealPlanHistoryInputDto {
  limit?: number;
}
