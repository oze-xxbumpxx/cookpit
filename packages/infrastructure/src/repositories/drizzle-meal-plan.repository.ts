import {
  MealPlan,
  PlannedRecipe,
  type MealPlanStatus,
} from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { PlannedRecipeId } from '@cookpit/domain/src/meal-plan/planned-recipe-id';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { DrizzleClient } from '../db/client';
import {
  mealPlans,
  plannedRecipes,
  type MealPlanRow,
  type NewMealPlanRow,
  type NewPlannedRecipeRow,
  type PlannedRecipeRow,
} from '../db/schema';

interface MealPlanWithPlannedRecipeRow {
  mealPlan: MealPlanRow;
  plannedRecipe: PlannedRecipeRow | null;
}

interface MealPlanGroup {
  mealPlan: MealPlanRow;
  plannedRecipes: PlannedRecipeRow[];
}

export class DrizzleMealPlanRepository implements MealPlanRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: MealPlanId): Promise<MealPlan | null> {
    const rows = await this.db
      .select({
        mealPlan: mealPlans,
        plannedRecipe: plannedRecipes,
      })
      .from(mealPlans)
      .leftJoin(plannedRecipes, eq(mealPlans.id, plannedRecipes.mealPlanId))
      .where(eq(mealPlans.id, id.value));

    if (rows.length === 0) {
      return null;
    }

    return this.toMealPlans(rows)[0] ?? null;
  }

  async findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null> {
    const rows = await this.db
      .select({
        mealPlan: mealPlans,
        plannedRecipe: plannedRecipes,
      })
      .from(mealPlans)
      .leftJoin(plannedRecipes, eq(mealPlans.id, plannedRecipes.mealPlanId))
      .where(eq(mealPlans.weekStartDate, weekIdentifier.toString()));

    if (rows.length === 0) {
      return null;
    }

    return this.toMealPlans(rows)[0] ?? null;
  }

  async findRecent(limit: number): Promise<MealPlan[]> {
    if (limit <= 0) {
      return [];
    }

    const rows = await this.db
      .select({
        mealPlan: mealPlans,
        plannedRecipe: plannedRecipes,
      })
      .from(mealPlans)
      .leftJoin(plannedRecipes, eq(mealPlans.id, plannedRecipes.mealPlanId))
      .orderBy(desc(mealPlans.weekStartDate));

    // JOIN expands child rows, so apply the MealPlan limit after grouping.
    return this.toMealPlans(rows).slice(0, limit);
  }

  async save(mealPlan: MealPlan): Promise<void> {
    const mealPlanRow = this.toMealPlanRow(mealPlan);
    await this.db
      .insert(mealPlans)
      .values(mealPlanRow)
      .onConflictDoUpdate({
        target: mealPlans.id,
        set: {
          status: mealPlanRow.status,
          completedAt: mealPlanRow.completedAt,
        },
      });

    const plannedRecipeRows = this.toPlannedRecipeRows(mealPlan);
    const currentIds = plannedRecipeRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db
        .delete(plannedRecipes)
        .where(
          and(
            eq(plannedRecipes.mealPlanId, mealPlan.id.value),
            notInArray(plannedRecipes.id, currentIds),
          ),
        );
    } else {
      await this.db.delete(plannedRecipes).where(eq(plannedRecipes.mealPlanId, mealPlan.id.value));
    }

    for (const row of plannedRecipeRows) {
      await this.db
        .insert(plannedRecipes)
        .values(row)
        .onConflictDoUpdate({
          target: plannedRecipes.id,
          set: {
            mealPlanId: row.mealPlanId,
            recipeId: row.recipeId,
            scaleFactor: row.scaleFactor,
            scheduledDate: row.scheduledDate,
            cookedAt: row.cookedAt,
            notes: row.notes,
          },
        });
    }
  }

  private toMealPlans(rows: MealPlanWithPlannedRecipeRow[]): MealPlan[] {
    const groups = new Map<string, MealPlanGroup>();

    for (const row of rows) {
      let group = groups.get(row.mealPlan.id);
      if (group === undefined) {
        group = {
          mealPlan: row.mealPlan,
          plannedRecipes: [],
        };
        groups.set(row.mealPlan.id, group);
      }

      if (row.plannedRecipe !== null) {
        group.plannedRecipes.push(row.plannedRecipe);
      }
    }

    return [...groups.values()].map((group) => this.toEntity(group.mealPlan, group.plannedRecipes));
  }

  private toEntity(mealPlanRow: MealPlanRow, plannedRecipeRows: PlannedRecipeRow[]): MealPlan {
    return MealPlan.reconstruct({
      id: MealPlanId.fromString(mealPlanRow.id),
      weekOf: WeekIdentifier.fromString(mealPlanRow.weekStartDate),
      plannedRecipes: plannedRecipeRows.map((row) =>
        PlannedRecipe.reconstruct({
          id: PlannedRecipeId.fromString(row.id),
          recipeId: RecipeId.fromString(row.recipeId),
          scaleFactor: Number(row.scaleFactor),
          scheduledDate: toDate(row.scheduledDate),
          cookedAt: row.cookedAt ?? null,
          notes: row.notes,
        }),
      ),
      status: toMealPlanStatus(mealPlanRow.status),
      createdAt: mealPlanRow.createdAt,
      completedAt: mealPlanRow.completedAt ?? null,
    });
  }

  private toMealPlanRow(mealPlan: MealPlan): NewMealPlanRow {
    return {
      id: mealPlan.id.value,
      weekStartDate: mealPlan.weekOf.toString(),
      status: mealPlan.status,
      createdAt: mealPlan.createdAt,
      completedAt: mealPlan.completedAt,
    };
  }

  private toPlannedRecipeRows(mealPlan: MealPlan): NewPlannedRecipeRow[] {
    return mealPlan.plannedRecipes.map((plannedRecipe) => ({
      id: plannedRecipe.id.value,
      mealPlanId: mealPlan.id.value,
      recipeId: plannedRecipe.recipeId.value,
      scaleFactor: plannedRecipe.scaleFactor.toString(),
      scheduledDate: toDateString(plannedRecipe.scheduledDate),
      cookedAt: plannedRecipe.cookedAt,
      notes: plannedRecipe.notes,
    }));
  }
}

function toMealPlanStatus(value: string): MealPlanStatus {
  switch (value) {
    case 'draft':
    case 'shopping':
    case 'cooking':
    case 'consuming':
    case 'completed':
      return value;
    default:
      throw new Error(`Unknown meal plan status: ${value}`);
  }
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value + 'T00:00:00');
}

function toDateString(value: Date | null): string | null {
  if (value === null) {
    return null;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${date}`;
}
