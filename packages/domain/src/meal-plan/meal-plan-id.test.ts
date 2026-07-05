import { describe, expect, it } from 'vitest';
import { MealPlanId } from './meal-plan-id';

describe('MealPlanId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const a = MealPlanId.generate();
    const b = MealPlanId.generate();

    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(MealPlanId.fromString('meal-plan-1').value).toBe('meal-plan-1');
  });

  it('同じ値どうしは equals が true', () => {
    expect(MealPlanId.fromString('meal-plan-1').equals(MealPlanId.fromString('meal-plan-1'))).toBe(
      true,
    );
  });

  it('異なる値どうしは equals が false', () => {
    expect(MealPlanId.fromString('meal-plan-1').equals(MealPlanId.fromString('meal-plan-2'))).toBe(
      false,
    );
  });
});
