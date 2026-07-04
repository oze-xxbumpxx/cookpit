import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { Unit } from '@cookpit/domain/src/shared/unit';
import type { RecipeIngredientDto, CookingStepDto, RecipeDto } from './recipe.dto';
import { RecipeIngredient } from '@cookpit/domain/src/recipe/recipe-ingredient';
import { CookingStep } from '@cookpit/domain/src/recipe/cooking-step';
import type { Recipe } from '@cookpit/domain/src/recipe/recipe';

function toQuantity(value: number | null, unit: Unit | null): Quantity | null {
  if (value === null || unit === null) {
    return null;
  }
  return Quantity.of(value, unit);
}

export function toIngredient(dto: RecipeIngredientDto): RecipeIngredient {
  return RecipeIngredient.create({
    productRef: dto.productRef !== null ? { value: dto.productRef } : null,
    displayName: dto.displayName,
    amount: toQuantity(dto.amountValue, dto.amountUnit),
    amountNote: dto.amountNote,
  });
}

export function toStep(dto: CookingStepDto): CookingStep {
  return new CookingStep(dto.description);
}
export function toRecipeDto(recipe: Recipe): RecipeDto {
  return {
    id: recipe.id.value,
    name: recipe.name,
    baseServings: recipe.baseServings,
    servings: recipe.servings,
    cookingTime: recipe.cookingTime,
    tags: recipe.tags,
    notes: recipe.notes,
    ingredients: recipe.ingredients.map(toIngredientDto),
    steps: recipe.steps.map(toStepDto),
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}
function toIngredientDto(ingredient: RecipeIngredient): RecipeIngredientDto {
  return {
    productRef: ingredient.productRef?.value ?? null,
    displayName: ingredient.displayName,
    amountValue: ingredient.amount?.value ?? null,
    amountUnit: ingredient.amount?.unit ?? null,
    amountNote: ingredient.amountNote,
  };
}

function toStepDto(step: CookingStep): CookingStepDto {
  return { description: step.description };
}
