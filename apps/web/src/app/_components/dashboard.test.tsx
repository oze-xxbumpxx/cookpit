import type { MealPlanDto, StockDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dashboard } from './dashboard';

const ASOF = new Date('2026-07-21T09:00:00');

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
    render(<Dashboard mealPlan={null} expiringStocks={[]} asOf={ASOF} />);

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

    render(<Dashboard mealPlan={mealPlan} expiringStocks={[]} asOf={ASOF} />);

    expect(screen.getByText('買い物中')).toBeTruthy();
    expect(screen.getByText('レシピ 2 品')).toBeTruthy();
  });

  it('賞味期限が近い在庫が無いとき空メッセージを表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} asOf={ASOF} />);

    expect(screen.getByText('まもなく期限を迎える在庫はありません')).toBeTruthy();
  });

  it('賞味期限が近い在庫を名称・保存場所・期限つきで一覧表示する', () => {
    const stocks = [
      createStock({ displayName: '鶏むね肉', expiresAt: '2026-07-22', storedLocation: 'freezer' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    expect(screen.getByText('鶏むね肉')).toBeTruthy();
    expect(screen.getByText('冷凍')).toBeTruthy();
    expect(screen.getByText('7/22まで')).toBeTruthy();
  });

  it('主要画面へのクイックリンクを表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} asOf={ASOF} />);

    expect(screen.getByRole('link', { name: '在庫' }).getAttribute('href')).toBe('/pantry');
    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
  });

  it('DC-01: 期限切れの在庫は赤バッジ + 「期限切れ」文言で表示する', () => {
    const stocks = [createStock({ id: 'overdue', expiresAt: '2026-07-19' })];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    const badge = screen.getByText('期限切れ');
    expect(badge.className).toContain('bg-destructive/10');
    expect(badge.className).toContain('text-destructive');
  });

  it('DC-02: 当日〜1 日の在庫はオレンジバッジで表示する', () => {
    const stocks = [
      createStock({ id: 'today', expiresAt: '2026-07-21' }),
      createStock({ id: 'tomorrow', expiresAt: '2026-07-22' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    const todayBadge = screen.getByText('本日まで');
    const tomorrowBadge = screen.getByText('明日まで');
    expect(todayBadge.className).toContain('bg-accent');
    expect(todayBadge.className).toContain('text-accent-foreground');
    expect(tomorrowBadge.className).toContain('bg-accent');
    expect(tomorrowBadge.className).toContain('text-accent-foreground');
  });

  it('DC-03: 2〜3 日の在庫は黄バッジで表示する', () => {
    const stocks = [
      createStock({ id: 'in2days', expiresAt: '2026-07-23' }),
      createStock({ id: 'in3days', expiresAt: '2026-07-24' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    const badge2 = screen.getByText('あと2日');
    const badge3 = screen.getByText('あと3日');
    expect(badge2.className).toContain('bg-[#F4E8D2]');
    expect(badge3.className).toContain('bg-[#F4E8D2]');
  });

  it('DC-04: urgency 境界（1→2 日）でバッジ色が切り替わる', () => {
    const stocks = [
      createStock({ id: 'tomorrow', expiresAt: '2026-07-22' }),
      createStock({ id: 'in2days', expiresAt: '2026-07-23' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    expect(screen.getByText('明日まで').className).toContain('bg-accent');
    expect(screen.getByText('あと2日').className).toContain('bg-[#F4E8D2]');
  });

  it('DC-05: 保存場所ごとに異なるアイコンを表示する', () => {
    const stocks = [
      createStock({ id: 'fridge', expiresAt: '2026-07-22', storedLocation: 'fridge' }),
      createStock({ id: 'freezer', expiresAt: '2026-07-22', storedLocation: 'freezer' }),
      createStock({ id: 'pantry', expiresAt: '2026-07-22', storedLocation: 'pantry' }),
      createStock({ id: 'unset', expiresAt: '2026-07-22', storedLocation: null }),
    ];

    const { container } = render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    expect(container.querySelector('.lucide-refrigerator')).toBeTruthy();
    expect(container.querySelector('.lucide-snowflake')).toBeTruthy();
    expect(container.querySelector('.lucide-package')).toBeTruthy();
    expect(container.querySelector('.lucide-circle-question-mark')).toBeTruthy();
  });

  it('DC-06: 既存テキスト表示（displayName / 保存場所ラベル / M/Dまで）が失われない', () => {
    const stock = createStock({
      displayName: '鶏むね肉',
      expiresAt: '2026-07-22',
      storedLocation: 'freezer',
    });

    render(<Dashboard mealPlan={null} expiringStocks={[stock]} asOf={ASOF} />);

    expect(screen.getByText('鶏むね肉')).toBeTruthy();
    expect(screen.getByText('冷凍')).toBeTruthy();
    expect(screen.getByText('7/22まで')).toBeTruthy();
  });

  it('DC-07: 見出しに件数バッジと Clock アイコンを表示する', () => {
    const stocks = [
      createStock({ id: 'a', expiresAt: '2026-07-22' }),
      createStock({ id: 'b', expiresAt: '2026-07-23' }),
      createStock({ id: 'c', expiresAt: '2026-07-24' }),
    ];

    const { container } = render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(container.querySelector('.lucide-clock')).toBeTruthy();
  });

  it('DC-08: 0 件時は件数バッジを表示せず空メッセージのみ表示する', () => {
    render(<Dashboard mealPlan={null} expiringStocks={[]} asOf={ASOF} />);

    expect(screen.getByText('まもなく期限を迎える在庫はありません')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('DC-09: expiresAt が null の在庫が混入しても例外を投げずに描画する', () => {
    const stocks = [createStock({ id: 'no-expiry', expiresAt: null })];

    expect(() =>
      render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />),
    ).not.toThrow();
  });

  it('DC-10: 渡された配列順（昇順）どおりにカードを描画する', () => {
    const stocks = [
      createStock({ id: 'a', displayName: '在庫A', expiresAt: '2026-07-21' }),
      createStock({ id: 'b', displayName: '在庫B', expiresAt: '2026-07-22' }),
      createStock({ id: 'c', displayName: '在庫C', expiresAt: '2026-07-23' }),
    ];

    render(<Dashboard mealPlan={null} expiringStocks={stocks} asOf={ASOF} />);

    const names = screen.getAllByText(/^在庫[ABC]$/).map((el) => el.textContent);
    expect(names).toEqual(['在庫A', '在庫B', '在庫C']);
  });

  it('DC-11: 賞味期限バッジは今週の献立チップと同型のベースクラスを持つ', () => {
    const mealPlan = createMealPlanDto({ status: 'shopping' });
    const stocks = [createStock({ expiresAt: '2026-07-22' })];

    render(<Dashboard mealPlan={mealPlan} expiringStocks={stocks} asOf={ASOF} />);

    const badge = screen.getByText('明日まで');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('font-medium');
  });
});
