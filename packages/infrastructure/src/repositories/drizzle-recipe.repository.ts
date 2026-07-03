import { eq } from 'drizzle-orm';
import { CookingStep } from '@cookpit/domain/src/recipe/cooking-step';
import { Recipe, type RecipeTag } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { RecipeIngredient } from '@cookpit/domain/src/recipe/recipe-ingredient';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { DrizzleClient } from '../db/client';
import { recipes, type NewRecipeRow, type RecipeRow } from '../db/schema';
import { toUnit } from './mappers';
type IngredientRow = {
  productRef: string | null;
  displayName: string;
  amountValue: number | null;
  amountUnit: string | null;
  amountNote: string | null;
};

type StepRow = {
  description: string;
};

export class DrizzleRecipeRepository implements RecipeRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: RecipeId): Promise<Recipe | null> {
    const rows = await this.db.select().from(recipes).where(eq(recipes.id, id.value)).limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toEntity(row);
  }

  async findAll(): Promise<Recipe[]> {
    const rows = await this.db.select().from(recipes).orderBy(recipes.createdAt);
    return rows.map((row) => this.toEntity(row));
  }

  async save(recipe: Recipe): Promise<void> {
    const row = this.toRow(recipe);
    await this.db
      .insert(recipes)
      .values(row)
      .onConflictDoUpdate({
        target: recipes.id,
        set: {
          name: row.name,
          baseServings: row.baseServings,
          servings: row.servings,
          cookingTime: row.cookingTime,
          tags: row.tags,
          notes: row.notes,
          ingredients: row.ingredients,
          steps: row.steps,
          updatedAt: row.updatedAt,
        },
      });
  }

  async delete(id: RecipeId): Promise<void> {
    await this.db.delete(recipes).where(eq(recipes.id, id.value));
  }

  private toEntity(row: RecipeRow): Recipe {
    const ingredients = (row.ingredients as IngredientRow[]).map((ing) => {
      const amountUnit = ing.amountUnit !== null ? toUnit(ing.amountUnit) : null;
      const amount =
        ing.amountValue !== null && amountUnit !== null
          ? Quantity.of(ing.amountValue, amountUnit)
          : null;

      return RecipeIngredient.create({
        productRef: ing.productRef !== null ? { value: ing.productRef } : null,
        displayName: ing.displayName,
        amount,
        amountNote: ing.amountNote,
      });
    });

    const steps = (row.steps as StepRow[]).map((step) => new CookingStep(step.description));

    return Recipe.reconstruct({
      id: RecipeId.fromString(row.id),
      name: row.name,
      ingredients,
      steps,
      baseServings: row.baseServings,
      tags: row.tags.map((tag) => toRecipeTag(tag)),
      cookingTime: row.cookingTime,
      notes: row.notes,
      servings: row.servings ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toRow(recipe: Recipe): NewRecipeRow {
    const ingredients: IngredientRow[] = recipe.ingredients.map((ingredient) => ({
      productRef: ingredient.productRef?.value ?? null,
      displayName: ingredient.displayName,
      amountValue: ingredient.amount?.value ?? null,
      amountUnit: ingredient.amount?.unit ?? null,
      amountNote: ingredient.amountNote,
    }));
    const steps: StepRow[] = recipe.steps.map((step) => ({
      description: step.description,
    }));

    return {
      id: recipe.id.value,
      name: recipe.name,
      baseServings: recipe.baseServings,
      servings: recipe.servings,
      cookingTime: recipe.cookingTime,
      tags: recipe.tags,
      notes: recipe.notes,
      ingredients,
      steps,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  }
}

function toRecipeTag(value: string): RecipeTag {
  switch (value) {
    case '主菜':
    case '副菜':
    case '汁物':
    case '作り置き向き':
    case '冷凍可':
      return value;
    default:
      throw new Error(`Unknown recipe tag: ${value}`);
  }
}
