import { PlannedRecipe, PlannedRecipeId, RecipeId } from '@cookpit/domain';
import { describe, expect, it } from 'vitest';
import { toPlannedRecipeDto } from '../../src/meal-plan/meal-plan.mapper';
import { toLocalDateString } from '../../src/shared/date';

function plannedRecipeWith(scheduledDate: Date | null): PlannedRecipe {
  return PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString('planned-recipe-1'),
    recipeId: RecipeId.fromString('recipe-1'),
    scaleFactor: 1,
    scheduledDate,
    cookedAt: null,
    notes: '',
  });
}

describe('toPlannedRecipeDto scheduledDate', () => {
  it('未設定なら null のまま', () => {
    expect(toPlannedRecipeDto(plannedRecipeWith(null)).scheduledDate).toBeNull();
  });

  it('ローカル 0 時の暦日を YYYY-MM-DD で返す', () => {
    const scheduledDate = new Date(2026, 6, 11);
    expect(toPlannedRecipeDto(plannedRecipeWith(scheduledDate)).scheduledDate).toBe('2026-07-11');
  });

  it('toISOString の UTC 日付ではなくローカル暦日を使う', () => {
    const scheduledDate = new Date(2026, 6, 11);
    const dto = toPlannedRecipeDto(plannedRecipeWith(scheduledDate));
    const localDate = toLocalDateString(scheduledDate);
    const utcDate = scheduledDate.toISOString().slice(0, 10);

    expect(dto.scheduledDate).toBe(localDate);
    if (utcDate !== localDate) {
      expect(dto.scheduledDate).not.toBe(utcDate);
    }
  });
});
