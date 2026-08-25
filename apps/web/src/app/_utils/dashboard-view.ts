import type { MealPlanDto, MealPlanStatus } from '@cookpit/application';

export const MEAL_PLAN_STATUS_LABELS: Record<MealPlanStatus, string> = {
  draft: '献立作成中',
  shopping: '買い物中',
  cooking: '調理中',
  consuming: '消費中',
  completed: '完了',
};

export interface DashboardNextAction {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

export function getNextAction(mealPlan: MealPlanDto | null): DashboardNextAction {
  if (mealPlan === null) {
    return {
      title: '今週の献立はまだありません',
      description: '土曜の起点は献立決めから。',
      href: '/meal-plans',
      ctaLabel: '今週の献立を作る',
    };
  }
  switch (mealPlan.status) {
    case 'draft':
      return {
        title: '献立を仕上げましょう',
        description: 'レシピを追加して今週のメニューを確定する',
        href: '/meal-plans',
        ctaLabel: '献立を続ける',
      };
    case 'shopping':
      return {
        title: '買い物に出かけましょう',
        description: '買い物リストを開いて購入を進める',
        href: '/shopping-lists',
        ctaLabel: '買い物リストを開く',
      };
    case 'cooking':
      return {
        title: '作り置きの時間です',
        description: '献立のレシピを見ながら調理する',
        href: '/meal-plans',
        ctaLabel: '献立を開く',
      };
    case 'consuming':
      return {
        title: '作り置きを食べましょう',
        description: '期限が近い在庫から消費するのがおすすめ',
        href: '/pantry',
        ctaLabel: '在庫を見る',
      };
    case 'completed':
      return {
        title: '今週は完了しました',
        description: '次の週の献立を準備できます',
        href: '/meal-plans',
        ctaLabel: '献立を見る',
      };
  }
}

export const MEAL_PLAN_STATUS_STEPS: { status: MealPlanStatus; label: string }[] = [
  { status: 'draft', label: '献立' },
  { status: 'shopping', label: '買い物' },
  { status: 'cooking', label: '調理' },
  { status: 'consuming', label: '消費' },
  { status: 'completed', label: '完了' },
];

export type StepState = 'complete' | 'current' | 'upcoming';

export function getStepState(current: MealPlanStatus | null, step: MealPlanStatus): StepState {
  if (current === null) {
    return 'upcoming';
  }
  const currentIndex = MEAL_PLAN_STATUS_STEPS.findIndex((s) => s.status === current);
  const stepIndex = MEAL_PLAN_STATUS_STEPS.findIndex((s) => s.status === step);
  if (stepIndex < currentIndex) {
    return 'complete';
  }
  if (stepIndex === currentIndex) {
    return 'current';
  }
  return 'upcoming';
}
