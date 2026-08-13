import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { MealPlan, MealPlanId, RecipeId, WeekIdentifier } from '@cookpit/domain';
import type { PlannedRecipe } from '@cookpit/domain';
import type { DrizzleClient } from '../../src/db/client';
import { mealPlans, plannedRecipes } from '../../src/db/schema';
import { createTestDb, DrizzleUnitOfWork } from '../testing/create-test-db';
import { DrizzleMealPlanRepository } from '../../src/repositories/drizzle-meal-plan.repository';

function createMealPlan(weekStartDate: string = '2026-07-04'): MealPlan {
  return MealPlan.create(WeekIdentifier.fromString(weekStartDate));
}

function addRecipe(
  mealPlan: MealPlan,
  recipeId: string = 'recipe-1',
  scaleFactor: number = 1,
): void {
  mealPlan.addRecipe(RecipeId.fromString(recipeId), scaleFactor);
}

function requireMealPlan(mealPlan: MealPlan | null): MealPlan {
  if (mealPlan === null) {
    throw new Error('Expected meal plan in test');
  }

  return mealPlan;
}

function requirePlannedRecipe(plannedRecipe: PlannedRecipe | undefined): PlannedRecipe {
  if (plannedRecipe === undefined) {
    throw new Error('Expected planned recipe in test');
  }

  return plannedRecipe;
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

describe('DrizzleMealPlanRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzleMealPlanRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzleMealPlanRepository(new DrizzleUnitOfWork(db));
  });

  it('save() → findById() で plannedRecipes 込みで復元される', async () => {
    const mealPlan = createMealPlan();
    addRecipe(mealPlan, 'recipe-1', 1.5);
    addRecipe(mealPlan, 'recipe-2', 2);

    await repository.save(mealPlan);

    const found = requireMealPlan(await repository.findById(mealPlan.id));

    expect(found.id.equals(mealPlan.id)).toBe(true);
    expect(found.weekOf.toString()).toBe('2026-07-04');
    expect(found.status).toBe('draft');
    expect(found.plannedRecipes).toHaveLength(2);
    expect(found.plannedRecipes.map((recipe) => recipe.recipeId.value).sort()).toEqual([
      'recipe-1',
      'recipe-2',
    ]);
  });

  it('空 DB で findById() / findByWeek() は null を返す', async () => {
    expect(await repository.findById(MealPlanId.generate())).toBeNull();
    expect(await repository.findByWeek(WeekIdentifier.fromString('2026-07-04'))).toBeNull();
  });

  it('findByWeek() は保存済みの週で取得できる', async () => {
    const mealPlan = createMealPlan('2026-07-04');
    await repository.save(mealPlan);

    const found = requireMealPlan(
      await repository.findByWeek(WeekIdentifier.fromString('2026-07-04')),
    );

    expect(found.id.equals(mealPlan.id)).toBe(true);
    expect(found.weekOf.toString()).toBe('2026-07-04');
  });

  it('findRecent(1) は MealPlan 単位で limit しつつ子行を全件保持する', async () => {
    const older = createMealPlan('2026-06-27');
    addRecipe(older, 'older-recipe', 1);
    await repository.save(older);

    const newer = createMealPlan('2026-07-04');
    addRecipe(newer, 'newer-recipe-1', 1);
    addRecipe(newer, 'newer-recipe-2', 1);
    await repository.save(newer);

    const recent = await repository.findRecent(1);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.id.equals(newer.id)).toBe(true);
    expect(recent[0]?.plannedRecipes).toHaveLength(2);
  });

  it('findRecent() は limit より DB 件数が少なくても実件数を返す', async () => {
    const mealPlan = createMealPlan();
    await repository.save(mealPlan);

    const recent = await repository.findRecent(5);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.id.equals(mealPlan.id)).toBe(true);
  });

  it('findRecent(2) は DB 件数 > limit のとき週降順で最新2件を返し、子行を切らない', async () => {
    const oldest = createMealPlan('2026-06-20');
    addRecipe(oldest, 'oldest-recipe', 1);
    await repository.save(oldest);

    const middle = createMealPlan('2026-06-27');
    addRecipe(middle, 'middle-recipe', 1);
    await repository.save(middle);

    const newest = createMealPlan('2026-07-04');
    addRecipe(newest, 'newest-recipe-1', 1);
    addRecipe(newest, 'newest-recipe-2', 1);
    await repository.save(newest);

    const recent = await repository.findRecent(2);

    expect(recent).toHaveLength(2);
    expect(recent[0]?.id.equals(newest.id)).toBe(true);
    expect(recent[1]?.id.equals(middle.id)).toBe(true);
    // 最新の複数レシピを持つ MealPlan が SQL LIMIT で途中で切れないこと
    expect(recent[0]?.plannedRecipes).toHaveLength(2);
    expect(recent[1]?.plannedRecipes).toHaveLength(1);
  });

  it('同一 id の再 save() は status を更新し weekStartDate は変更しない', async () => {
    const mealPlan = createMealPlan('2026-07-04');
    await repository.save(mealPlan);

    const changedWeek = MealPlan.reconstruct({
      id: mealPlan.id,
      weekOf: WeekIdentifier.fromString('2026-07-11'),
      plannedRecipes: [],
      status: 'shopping',
      createdAt: mealPlan.createdAt,
      completedAt: null,
    });
    await repository.save(changedWeek);

    const rows = await db.select().from(mealPlans).where(eq(mealPlans.id, mealPlan.id.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weekStartDate).toBe('2026-07-04');
    expect(rows[0]?.status).toBe('shopping');
  });

  it('removeRecipe() 後の再 save() で planned_recipes から削除される', async () => {
    const mealPlan = createMealPlan();
    const firstRecipeId = mealPlan.addRecipe(RecipeId.fromString('recipe-1'), 1);
    mealPlan.addRecipe(RecipeId.fromString('recipe-2'), 1);
    await repository.save(mealPlan);

    mealPlan.removeRecipe(firstRecipeId);
    await repository.save(mealPlan);

    const rows = await db
      .select()
      .from(plannedRecipes)
      .where(eq(plannedRecipes.mealPlanId, mealPlan.id.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipeId).toBe('recipe-2');
  });

  it('scaleFactor は number として復元される', async () => {
    const mealPlan = createMealPlan();
    addRecipe(mealPlan, 'recipe-1', 1.5);
    await repository.save(mealPlan);

    const found = requireMealPlan(await repository.findById(mealPlan.id));
    const plannedRecipe = requirePlannedRecipe(found.plannedRecipes[0]);

    expect(typeof plannedRecipe.scaleFactor).toBe('number');
    expect(plannedRecipe.scaleFactor).toBe(1.5);
  });

  it('weekOf / scheduledDate は日付ずれなく往復する', async () => {
    const mealPlan = createMealPlan('2026-07-04');
    const plannedRecipeId = mealPlan.addRecipe(RecipeId.fromString('recipe-1'), 1);
    mealPlan.scheduleForDay(plannedRecipeId, new Date('2026-07-06T00:00:00'));
    await repository.save(mealPlan);

    const found = requireMealPlan(await repository.findById(mealPlan.id));
    const plannedRecipe = requirePlannedRecipe(found.plannedRecipes[0]);

    expect(found.weekOf.toString()).toBe('2026-07-04');
    expect(plannedRecipe.scheduledDate).not.toBeNull();
    if (plannedRecipe.scheduledDate === null) {
      throw new Error('Expected scheduledDate in test');
    }
    expect(toLocalDateString(plannedRecipe.scheduledDate)).toBe('2026-07-06');
  });

  it('cookedAt / completedAt が null の場合、復元後も null になる', async () => {
    const mealPlan = createMealPlan();
    addRecipe(mealPlan);
    await repository.save(mealPlan);

    const found = requireMealPlan(await repository.findById(mealPlan.id));
    const plannedRecipe = requirePlannedRecipe(found.plannedRecipes[0]);

    expect(found.completedAt).toBeNull();
    expect(plannedRecipe.cookedAt).toBeNull();
  });

  it("notes: '' が往復する", async () => {
    const mealPlan = createMealPlan();
    addRecipe(mealPlan);
    await repository.save(mealPlan);

    const found = requireMealPlan(await repository.findById(mealPlan.id));
    const plannedRecipe = requirePlannedRecipe(found.plannedRecipes[0]);

    expect(plannedRecipe.notes).toBe('');
  });

  it('recipeId は外部キー制約なしで保存できる', async () => {
    const mealPlan = createMealPlan();
    addRecipe(mealPlan, 'missing-recipe', 1);

    await expect(repository.save(mealPlan)).resolves.toBeUndefined();

    const rows = await db.select().from(plannedRecipes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipeId).toBe('missing-recipe');
  });
});
