import type { MealPlanDto, MealPlanStatus } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  getNextAction,
  getStepState,
  MEAL_PLAN_STATUS_LABELS,
  MEAL_PLAN_STATUS_STEPS,
} from '../../../src/app/_utils/dashboard-view';

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

describe('MEAL_PLAN_STATUS_LABELS', () => {
  it('全ステータスに日本語ラベルがある', () => {
    expect(MEAL_PLAN_STATUS_LABELS.draft).toBe('献立作成中');
    expect(MEAL_PLAN_STATUS_LABELS.shopping).toBe('買い物中');
    expect(MEAL_PLAN_STATUS_LABELS.cooking).toBe('調理中');
    expect(MEAL_PLAN_STATUS_LABELS.consuming).toBe('消費中');
    expect(MEAL_PLAN_STATUS_LABELS.completed).toBe('完了');
  });
});

describe('getNextAction', () => {
  it('NA-01: mealPlan なしのとき献立作成 CTA を返す', () => {
    expect(getNextAction(null)).toEqual({
      title: '今週の献立はまだありません',
      description: '土曜の起点は献立決めから。',
      href: '/meal-plans',
      ctaLabel: '今週の献立を作る',
    });
  });

  it('NA-02: draft のとき献立を続ける CTA を返す', () => {
    expect(getNextAction(createMealPlanDto({ status: 'draft' }))).toEqual({
      title: '献立を仕上げましょう',
      description: 'レシピを追加して今週のメニューを確定する',
      href: '/meal-plans',
      ctaLabel: '献立を続ける',
    });
  });

  it('NA-03: shopping のとき買い物リストを開く CTA を返す', () => {
    expect(getNextAction(createMealPlanDto({ status: 'shopping' }))).toEqual({
      title: '買い物に出かけましょう',
      description: '買い物リストを開いて購入を進める',
      href: '/shopping-lists',
      ctaLabel: '買い物リストを開く',
    });
  });

  it('NA-04: cooking のとき献立を開く CTA を返す', () => {
    expect(getNextAction(createMealPlanDto({ status: 'cooking' }))).toEqual({
      title: '作り置きの時間です',
      description: '献立のレシピを見ながら調理する',
      href: '/meal-plans',
      ctaLabel: '献立を開く',
    });
  });

  it('NA-05: consuming のとき在庫を見る CTA を返す', () => {
    expect(getNextAction(createMealPlanDto({ status: 'consuming' }))).toEqual({
      title: '作り置きを食べましょう',
      description: '期限が近い在庫から消費するのがおすすめ',
      href: '/pantry',
      ctaLabel: '在庫を見る',
    });
  });

  it('NA-06: completed のとき献立を見る CTA を返す', () => {
    expect(getNextAction(createMealPlanDto({ status: 'completed' }))).toEqual({
      title: '今週は完了しました',
      description: '次の週の献立を準備できます',
      href: '/meal-plans',
      ctaLabel: '献立を見る',
    });
  });
});

describe('MEAL_PLAN_STATUS_STEPS', () => {
  it('SS-01: 5 件が draft/shopping/cooking/consuming/completed の順で固定されている', () => {
    expect(MEAL_PLAN_STATUS_STEPS).toEqual([
      { status: 'draft', label: '献立' },
      { status: 'shopping', label: '買い物' },
      { status: 'cooking', label: '調理' },
      { status: 'consuming', label: '消費' },
      { status: 'completed', label: '完了' },
    ]);
  });
});

describe('getStepState', () => {
  function statesFor(current: MealPlanStatus | null): string[] {
    return MEAL_PLAN_STATUS_STEPS.map((step) => getStepState(current, step.status));
  }

  it('SS-02: current が null のとき全ステップが upcoming', () => {
    expect(statesFor(null)).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('SS-03: current が draft のとき先頭が current、残りが upcoming', () => {
    expect(statesFor('draft')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('SS-04: current が shopping のとき draft が complete、shopping が current', () => {
    expect(statesFor('shopping')).toEqual([
      'complete',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('SS-05: current が cooking のとき draft/shopping が complete、cooking が current', () => {
    expect(statesFor('cooking')).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });

  it('SS-06: current が consuming のとき前 3 件が complete、consuming が current', () => {
    expect(statesFor('consuming')).toEqual([
      'complete',
      'complete',
      'complete',
      'current',
      'upcoming',
    ]);
  });

  it('SS-07: current が completed のとき前 4 件が complete、completed が current', () => {
    expect(statesFor('completed')).toEqual([
      'complete',
      'complete',
      'complete',
      'complete',
      'current',
    ]);
  });
});
