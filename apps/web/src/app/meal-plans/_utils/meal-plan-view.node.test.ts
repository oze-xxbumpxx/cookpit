import type { RecipeDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import { buildRecipeNameMap, formatWeekRange, resolveHistoryLimit } from './meal-plan-view';

function createRecipeDto(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '肉じゃが',
    baseServings: 2,
    servings: null,
    cookingTime: 30,
    tags: [],
    notes: '',
    ingredients: [],
    steps: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatWeekRange', () => {
  it('U-V-01: 通常週を整形する', () => {
    expect(formatWeekRange('2026-07-04')).toBe('7/4（土）〜7/10（金）');
  });

  it('U-V-02: 月またぎ週を整形する', () => {
    expect(formatWeekRange('2026-06-27')).toBe('6/27（土）〜7/3（金）');
  });

  it('U-V-03: 年またぎ週を整形する', () => {
    expect(formatWeekRange('2026-12-26')).toBe('12/26（土）〜1/1（金）');
  });
});

describe('buildRecipeNameMap', () => {
  it('U-V-04: recipeId → name の Map を構築する', () => {
    const recipes = [
      createRecipeDto({ id: 'id-1', name: '肉じゃが' }),
      createRecipeDto({ id: 'id-2', name: 'カレー' }),
    ];

    const map = buildRecipeNameMap(recipes);

    expect(map.size).toBe(2);
    expect(map.get('id-1')).toBe('肉じゃが');
    expect(map.get('id-2')).toBe('カレー');
  });

  it('U-V-05: 空配列は空 Map を返す', () => {
    const map = buildRecipeNameMap([]);

    expect(map.size).toBe(0);
  });
});

describe('resolveHistoryLimit', () => {
  it('U-V-06: 省略時は既定値 4', () => {
    expect(resolveHistoryLimit(undefined)).toBe(4);
  });

  it('U-V-07: 有効域はそのまま', () => {
    expect(resolveHistoryLimit('1')).toBe(1);
    expect(resolveHistoryLimit('4')).toBe(4);
    expect(resolveHistoryLimit('12')).toBe(12);
  });

  it('U-V-08: 下限に clamp する', () => {
    expect(resolveHistoryLimit('0')).toBe(1);
    expect(resolveHistoryLimit('-3')).toBe(1);
  });

  it('U-V-09: 上限に clamp する', () => {
    expect(resolveHistoryLimit('13')).toBe(12);
  });

  it('U-V-10: 非整数は既定値 4', () => {
    expect(resolveHistoryLimit('abc')).toBe(4);
    expect(resolveHistoryLimit('4.5')).toBe(4);
  });
});
