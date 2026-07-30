import type { MealPlanDto, PlannedRecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryWeekCard } from '../../../../src/app/meal-plans/_components/history-week-card';

function createPlannedRecipeDto(overrides: Partial<PlannedRecipeDto> = {}): PlannedRecipeDto {
  return {
    id: '959f4401-ef0f-4d1f-bc22-0912bce1147f',
    recipeId: '550e8400-e29b-41d4-a716-446655440000',
    scaleFactor: 1,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
    ...overrides,
  };
}

function createMealPlanDto(overrides: Partial<MealPlanDto> = {}): MealPlanDto {
  return {
    id: '4a88f79a-6ef6-46d3-931f-eae7cf283ae8',
    weekIdentifier: '2026-07-04',
    status: 'draft',
    plannedRecipes: [],
    createdAt: '2026-07-04T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

const RECIPE_NAME_MAP = new Map([['550e8400-e29b-41d4-a716-446655440000', '肉じゃが']]);

describe('HistoryWeekCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('WC-H-01: 週表示とレシピ名（倍量付き）が列挙される', () => {
    const mealPlan = createMealPlanDto({
      plannedRecipes: [createPlannedRecipeDto({ scaleFactor: 2 })],
    });
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={false} />,
    );

    expect(screen.getByText('7/4（土）〜7/10（金）')).toBeDefined();
    expect(screen.getByText('肉じゃが')).toBeDefined();
    expect(screen.getByText('2×')).toBeDefined();
  });

  it('WC-H-02: isCurrentWeek のとき「今週」ラベルが表示される', () => {
    const mealPlan = createMealPlanDto();
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={true} />,
    );

    expect(screen.getByText('今週')).toBeDefined();
  });

  it('WC-H-03: 過去週では「今週」ラベルが表示されない', () => {
    const mealPlan = createMealPlanDto();
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={false} />,
    );

    expect(screen.queryByText('今週')).toBeNull();
  });

  it('WC-H-04: レシピ 0 件の週は「レシピなし」と表示される', () => {
    const mealPlan = createMealPlanDto({ plannedRecipes: [] });
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={false} />,
    );

    expect(screen.getByText('レシピなし')).toBeDefined();
  });

  it('WC-H-05: 名前解決できないレシピは「削除済みレシピ」表示になる', () => {
    const mealPlan = createMealPlanDto({
      plannedRecipes: [createPlannedRecipeDto({ recipeId: 'unknown-id' })],
    });
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={false} />,
    );

    expect(screen.getByText('削除済みレシピ')).toBeDefined();
  });

  it('WC-H-06: ステータス文字列は表示されない（D-2）', () => {
    const mealPlan = createMealPlanDto({ status: 'draft' });
    render(
      <HistoryWeekCard mealPlan={mealPlan} recipeNameMap={RECIPE_NAME_MAP} isCurrentWeek={false} />,
    );

    expect(screen.queryByText('draft')).toBeNull();
  });
});
