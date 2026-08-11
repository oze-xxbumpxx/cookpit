import type { MealPlanStatus } from '@cookpit/application';

export const MEAL_PLAN_STATUS_LABELS: Record<MealPlanStatus, string> = {
  draft: '献立作成中',
  shopping: '買い物中',
  cooking: '調理中',
  consuming: '消費中',
  completed: '完了',
};
