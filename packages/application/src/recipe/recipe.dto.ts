import type { RecipeTag } from '@cookpit/domain/src/recipe/recipe';
import type { Unit } from '@cookpit/domain/src/shared/unit';
export interface RecipeIngredientDto {
  productRef: string | null;
  displayName: string;
  amountValue: number | null;
  amountUnit: Unit | null;
  amountNote: string | null;
}

export interface CookingStepDto {
  description: string;
}

export interface RecipeDto {
  id: string;
  name: string;
  baseServings: number;
  servings: number | null;
  cookingTime: number | null;
  tags: RecipeTag[];
  notes: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipeInputDto {
  name: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  baseServings: number;
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
  servings?: number | null;
}

export interface UpdateRecipeInputDto {
  id: string;
  name: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
  servings?: number | null;
}
