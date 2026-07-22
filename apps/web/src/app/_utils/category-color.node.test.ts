import { describe, expect, it } from 'vitest';
import {
  mealPlanStatusChipClass,
  productCategoryChipClass,
  recipeTagChipClass,
} from './category-color';

describe('recipeTagChipClass', () => {
  it('既知タグは固定の配色クラスを返す', () => {
    expect(recipeTagChipClass('主菜')).toContain('bg-[#F3E2DC]');
    expect(recipeTagChipClass('副菜')).toContain('bg-[#E7EEDD]');
    expect(recipeTagChipClass('冷凍可')).toContain('bg-[#E2E8F1]');
  });

  it('未知タグは neutral にフォールバックする', () => {
    expect(recipeTagChipClass('存在しないタグ')).toBe('bg-secondary text-secondary-foreground');
  });
});

describe('productCategoryChipClass', () => {
  it('既知カテゴリは固定の配色クラスを返す', () => {
    expect(productCategoryChipClass('野菜')).toContain('bg-[#E7EEDD]');
    expect(productCategoryChipClass('肉')).toContain('bg-[#F3E2DC]');
    expect(productCategoryChipClass('乾物')).toContain('bg-[#ECE1CE]');
  });

  it('その他・未知カテゴリは neutral', () => {
    expect(productCategoryChipClass('その他')).toBe('bg-secondary text-secondary-foreground');
    expect(productCategoryChipClass('未知')).toBe('bg-secondary text-secondary-foreground');
  });
});

describe('mealPlanStatusChipClass', () => {
  it('進行段階ごとに配色クラスを返す', () => {
    expect(mealPlanStatusChipClass('draft')).toBe('bg-secondary text-secondary-foreground');
    expect(mealPlanStatusChipClass('shopping')).toContain('bg-[#F4E8D2]');
    expect(mealPlanStatusChipClass('cooking')).toContain('bg-[#F3E2DC]');
    expect(mealPlanStatusChipClass('consuming')).toContain('bg-[#E7EEDD]');
    expect(mealPlanStatusChipClass('completed')).toContain('bg-[#E2E8F1]');
  });

  it('未知ステータスは neutral', () => {
    expect(mealPlanStatusChipClass('unknown')).toBe('bg-secondary text-secondary-foreground');
  });
});
