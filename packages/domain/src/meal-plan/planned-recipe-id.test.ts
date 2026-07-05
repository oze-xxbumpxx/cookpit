import { describe, expect, it } from 'vitest';
import { PlannedRecipeId } from './planned-recipe-id';

describe('PlannedRecipeId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const a = PlannedRecipeId.generate();
    const b = PlannedRecipeId.generate();

    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(PlannedRecipeId.fromString('planned-recipe-1').value).toBe('planned-recipe-1');
  });

  it('同じ値どうしは equals が true', () => {
    expect(
      PlannedRecipeId.fromString('planned-recipe-1').equals(
        PlannedRecipeId.fromString('planned-recipe-1'),
      ),
    ).toBe(true);
  });

  it('異なる値どうしは equals が false', () => {
    expect(
      PlannedRecipeId.fromString('planned-recipe-1').equals(
        PlannedRecipeId.fromString('planned-recipe-2'),
      ),
    ).toBe(false);
  });
});
