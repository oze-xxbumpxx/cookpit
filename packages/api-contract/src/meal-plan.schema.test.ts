import { toMealPlanDto, toPlannedRecipeDto } from '@cookpit/application';
import type { MealPlanDto, PlannedRecipeDto } from '@cookpit/application';
import {
  MealPlan,
  MealPlanId,
  PlannedRecipe,
  PlannedRecipeId,
  RecipeId,
  WeekIdentifier,
} from '@cookpit/domain';
import { describe, expect, it } from 'vitest';
import {
  addRecipeToMealPlanSchema,
  createMealPlanSchema,
  errorResponseSchema,
  getCurrentMealPlanResponseSchema,
  getMealPlanHistoryQuerySchema,
  mealPlanHistoryResponseSchema,
  mealPlanIdParamSchema,
  mealPlanResponseSchema,
  plannedRecipeIdParamSchema,
  plannedRecipeResponseSchema,
} from './meal-plan.schema';

const VALID_MEAL_PLAN_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PLANNED_RECIPE_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_VALID_PLANNED_RECIPE_ID = '33333333-3333-4333-8333-333333333333';
const VALID_RECIPE_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_VALID_RECIPE_ID = '55555555-5555-4555-8555-555555555555';

function plannedRecipeFixture(
  id: string,
  recipeId: string,
  scheduledDate: Date | null,
  cookedAt: Date | null,
): PlannedRecipe {
  return PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString(id),
    recipeId: RecipeId.fromString(recipeId),
    scaleFactor: 1.5,
    scheduledDate,
    cookedAt,
    notes: '',
  });
}

function mealPlanFixture(): MealPlan {
  return MealPlan.reconstruct({
    id: MealPlanId.fromString(VALID_MEAL_PLAN_ID),
    weekOf: WeekIdentifier.fromString('2026-07-04'),
    plannedRecipes: [
      plannedRecipeFixture(
        VALID_PLANNED_RECIPE_ID,
        VALID_RECIPE_ID,
        new Date('2026-07-06T00:00:00.000Z'),
        new Date('2026-07-06T18:30:00.000Z'),
      ),
      plannedRecipeFixture(SECOND_VALID_PLANNED_RECIPE_ID, SECOND_VALID_RECIPE_ID, null, null),
    ],
    status: 'draft',
    createdAt: new Date('2026-07-04T01:00:00.000Z'),
    completedAt: null,
  });
}

describe('createMealPlanSchema', () => {
  it('ISO date 形式の weekIdentifier を受け入れる', () => {
    expect(createMealPlanSchema.parse({ weekIdentifier: '2026-07-04' })).toEqual({
      weekIdentifier: '2026-07-04',
    });
  });

  it.each(['2026/07/04', '2026-13-01', '2026-02-30'])(
    '不正な weekIdentifier %s を reject する',
    (weekIdentifier) => {
      expect(() => createMealPlanSchema.parse({ weekIdentifier })).toThrow();
    },
  );

  it('閏年の2月29日を受け入れる', () => {
    expect(createMealPlanSchema.parse({ weekIdentifier: '2028-02-29' })).toEqual({
      weekIdentifier: '2028-02-29',
    });
  });
});

describe('meal plan parameter schemas', () => {
  it('正常な MealPlan id を受け入れる', () => {
    expect(mealPlanIdParamSchema.parse({ id: VALID_MEAL_PLAN_ID })).toEqual({
      id: VALID_MEAL_PLAN_ID,
    });
  });

  it('正常な id と plannedRecipeId の組を受け入れる', () => {
    expect(
      plannedRecipeIdParamSchema.parse({
        id: VALID_MEAL_PLAN_ID,
        plannedRecipeId: VALID_PLANNED_RECIPE_ID,
      }),
    ).toEqual({
      id: VALID_MEAL_PLAN_ID,
      plannedRecipeId: VALID_PLANNED_RECIPE_ID,
    });
  });

  it('不正な MealPlan id を reject する', () => {
    expect(() => mealPlanIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });

  it('不正な plannedRecipeId を reject する', () => {
    expect(() =>
      plannedRecipeIdParamSchema.parse({
        id: VALID_MEAL_PLAN_ID,
        plannedRecipeId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});

describe('addRecipeToMealPlanSchema', () => {
  it('不正な recipeId を reject する', () => {
    expect(() =>
      addRecipeToMealPlanSchema.parse({ recipeId: 'not-a-uuid', scaleFactor: 1 }),
    ).toThrow();
  });

  it.each([0, -1])('scaleFactor %s を reject する', (scaleFactor) => {
    expect(() =>
      addRecipeToMealPlanSchema.parse({ recipeId: VALID_RECIPE_ID, scaleFactor }),
    ).toThrow();
  });

  it.each([0.001, 3])('scaleFactor %s を受け入れる', (scaleFactor) => {
    expect(addRecipeToMealPlanSchema.parse({ recipeId: VALID_RECIPE_ID, scaleFactor })).toEqual({
      recipeId: VALID_RECIPE_ID,
      scaleFactor,
    });
  });
});

describe('getMealPlanHistoryQuerySchema', () => {
  it.each([
    ['1', 1],
    ['12', 12],
  ])('limit %s を number %s に coerce する', (input, expected) => {
    expect(getMealPlanHistoryQuerySchema.parse({ limit: input })).toEqual({ limit: expected });
  });

  it.each(['13', '0', '', 'abc', '2.5'])('不正な limit %s を reject する', (limit) => {
    expect(() => getMealPlanHistoryQuerySchema.parse({ limit })).toThrow();
  });

  it('limit 未指定時にデフォルト 4 を返す', () => {
    expect(getMealPlanHistoryQuerySchema.parse({})).toEqual({ limit: 4 });
  });
});

describe('meal plan response schemas', () => {
  it('toMealPlanDto の出力を mealPlanResponseSchema で parse できる', () => {
    const dto: MealPlanDto = toMealPlanDto(mealPlanFixture());

    expect(dto.plannedRecipes).toHaveLength(2);
    expect(mealPlanResponseSchema.parse(dto)).toEqual(dto);
  });

  it('toPlannedRecipeDto の値あり nullable フィールドを parse できる', () => {
    const dto: PlannedRecipeDto = toPlannedRecipeDto(
      plannedRecipeFixture(
        VALID_PLANNED_RECIPE_ID,
        VALID_RECIPE_ID,
        new Date('2026-07-06T00:00:00.000Z'),
        new Date('2026-07-06T18:30:00.000Z'),
      ),
    );

    expect(dto.scheduledDate).toBe('2026-07-06');
    expect(dto.cookedAt).toBe('2026-07-06T18:30:00.000Z');
    expect(plannedRecipeResponseSchema.parse(dto)).toEqual(dto);
  });

  it('toPlannedRecipeDto の null nullable フィールドを parse できる', () => {
    const dto: PlannedRecipeDto = toPlannedRecipeDto(
      plannedRecipeFixture(VALID_PLANNED_RECIPE_ID, VALID_RECIPE_ID, null, null),
    );

    expect(dto.scheduledDate).toBeNull();
    expect(dto.cookedAt).toBeNull();
    expect(plannedRecipeResponseSchema.parse(dto)).toEqual(dto);
  });

  it('completed ステータスと completedAt の値ありを parse できる', () => {
    const dto: MealPlanDto = toMealPlanDto(
      MealPlan.reconstruct({
        id: MealPlanId.fromString(VALID_MEAL_PLAN_ID),
        weekOf: WeekIdentifier.fromString('2026-07-04'),
        plannedRecipes: [],
        status: 'completed',
        createdAt: new Date('2026-07-04T01:00:00.000Z'),
        completedAt: new Date('2026-07-10T12:00:00.000Z'),
      }),
    );

    expect(dto.status).toBe('completed');
    expect(dto.completedAt).toBe('2026-07-10T12:00:00.000Z');
    expect(mealPlanResponseSchema.parse(dto)).toEqual(dto);
  });

  it('現在週の MealPlan がないレスポンスを parse できる', () => {
    expect(getCurrentMealPlanResponseSchema.parse({ data: null })).toEqual({ data: null });
  });

  it('MealPlan 履歴レスポンスを parse できる', () => {
    const dto: MealPlanDto = toMealPlanDto(mealPlanFixture());

    expect(mealPlanHistoryResponseSchema.parse([dto])).toEqual([dto]);
  });
});

describe('errorResponseSchema', () => {
  it('{ error: string } 形式を parse できる', () => {
    expect(errorResponseSchema.parse({ error: 'MealPlan not found: xxx' })).toEqual({
      error: 'MealPlan not found: xxx',
    });
  });

  it('error フィールド欠落を reject する', () => {
    expect(() => errorResponseSchema.parse({})).toThrow();
  });
});
