import type { MealPlanDto, StockDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dashboard } from './dashboard';

function createMealPlanDto(overrides: Partial<MealPlanDto> = {}): MealPlanDto {
  return {
    id: '4a88f79a-6ef6-46d3-931f-eae7cf283ae8',
    weekIdentifier: '2026-07-18',
    status: 'draft',
    plannedRecipes: [],
    createdAt: '2026-07-18T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

function createStock(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: 'stock-1',
    productId: null,
    displayName: '牛乳',
    amount: { value: 1, unit: '本' },
    purchasedAt: '2026-07-18T00:00:00.000Z',
    expiresAt: '2026-07-22',
    storedLocation: 'fridge',
    ...overrides,
  };
}

describe('Dashboard', () => {
  afterEach(() => {
    cleanup();
  });

  it('今週の献立が無いとき作成 CTA を表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} />);

    const cta = screen.getByRole('link', { name: '今週の献立を作る' });
    expect(cta.getAttribute('href')).toBe('/meal-plans');
  });

  it('今週の献立があるとき状態ラベルとレシピ件数を表示する', () => {
    const mealPlan = createMealPlanDto({
      status: 'shopping',
      plannedRecipes: [
        {
          id: 'p1',
          recipeId: 'r1',
          scaleFactor: 1,
          scheduledDate: null,
          cookedAt: null,
          notes: '',
        },
        {
          id: 'p2',
          recipeId: 'r2',
          scaleFactor: 1,
          scheduledDate: null,
          cookedAt: null,
          notes: '',
        },
      ],
    });

    render(<Dashboard mealPlan={mealPlan} expiringStocks={[]} />);

    expect(screen.getByText('買い物中')).toBeTruthy();
    expect(screen.getByText('レシピ 2 品')).toBeTruthy();
  });

  it('賞味期限が近い在庫が無いとき空メッセージを表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} />);

    expect(screen.getByText('まもなく期限を迎える在庫はありません。')).toBeTruthy();
  });

  it('賞味期限が近い在庫を名称・保存場所・期限つきで一覧表示する', () => {
    const stocks = [
      createStock({ displayName: '鶏むね肉', expiresAt: '2026-07-22', storedLocation: 'freezer' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} />);

    expect(screen.getByText('鶏むね肉')).toBeTruthy();
    expect(screen.getByText('冷凍')).toBeTruthy();
    expect(screen.getByText('7/22まで')).toBeTruthy();
  });

  it('主要画面へのクイックリンクを表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} />);

    expect(screen.getByRole('link', { name: '在庫' }).getAttribute('href')).toBe('/pantry');
    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
  });
});
