import {
  MealPlan,
  MealPlanId,
  PlannedRecipe,
  PlannedRecipeId,
  RecipeId,
  WeekIdentifier,
} from '@cookpit/domain';
import type { MealPlanRepository, MealPlanStatus } from '@cookpit/domain';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db/client';
import { toLocalDate, toLocalDateString } from './mappers';
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

    // Limit the parent rows in SQL first; a JOIN + LIMIT would truncate child
    // rows of the newest meal plan, so fetch children in a second query by id.
    const mealPlanRows = await this.db
      .select()
      .from(mealPlans)
      .orderBy(desc(mealPlans.weekStartDate))
      .limit(limit);

    if (mealPlanRows.length === 0) {
      return [];
    }

    const ids = mealPlanRows.map((row) => row.id);
    const plannedRecipeRows = await this.db
      .select()
      .from(plannedRecipes)
      .where(inArray(plannedRecipes.mealPlanId, ids));

    const plannedByMealPlan = new Map<string, PlannedRecipeRow[]>();
    for (const row of plannedRecipeRows) {
      const existing = plannedByMealPlan.get(row.mealPlanId) ?? [];
      existing.push(row);
      plannedByMealPlan.set(row.mealPlanId, existing);
    }

    return mealPlanRows.map((mealPlanRow) =>
      this.toEntity(mealPlanRow, plannedByMealPlan.get(mealPlanRow.id) ?? []),
    );
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

    if (plannedRecipeRows.length > 0) {
      // 配列バッチ upsert。set は各行の値を excluded.* で参照する。
      await this.db
        .insert(plannedRecipes)
        .values(plannedRecipeRows)
        .onConflictDoUpdate({
          target: plannedRecipes.id,
          set: {
            mealPlanId: sql`excluded.meal_plan_id`,
            recipeId: sql`excluded.recipe_id`,
            scaleFactor: sql`excluded.scale_factor`,
            scheduledDate: sql`excluded.scheduled_date`,
            cookedAt: sql`excluded.cooked_at`,
            notes: sql`excluded.notes`,
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
          scheduledDate: row.scheduledDate === null ? null : toLocalDate(row.scheduledDate),
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
      scheduledDate:
        plannedRecipe.scheduledDate === null
          ? null
          : toLocalDateString(plannedRecipe.scheduledDate),
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
