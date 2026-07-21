import { describe, expect, it } from 'vitest';
import {
  expiryUrgencyChipClass,
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

describe('expiryUrgencyChipClass', () => {
  it('EC-01: overdue は赤系の配色クラスを返す', () => {
    const result = expiryUrgencyChipClass('overdue');
    expect(result).toContain('bg-destructive/10');
    expect(result).toContain('text-destructive');
  });

  it('EC-02: critical はオレンジ系（accent）の配色クラスを返す', () => {
    const result = expiryUrgencyChipClass('critical');
    expect(result).toContain('bg-accent');
    expect(result).toContain('text-accent-foreground');
  });

  it('EC-03: soon は amber（黄）の配色クラスを返す', () => {
    expect(expiryUrgencyChipClass('soon')).toBe('bg-[#F4E8D2] text-[#785A1E]');
  });

  it('EC-04: critical は肉カテゴリの rose と混同しない', () => {
    expect(expiryUrgencyChipClass('critical')).not.toBe(productCategoryChipClass('肉'));
  });

  it('EC-05: 未知値は neutral にフォールバックする', () => {
    expect(expiryUrgencyChipClass('unknown')).toBe('bg-secondary text-secondary-foreground');
  });
});
