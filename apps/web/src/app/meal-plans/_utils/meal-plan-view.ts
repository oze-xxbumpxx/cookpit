import type { MealPlanDto, RecipeDto } from '@cookpit/application';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// レシピの追加・削除が許されるステータスか。サーバー仕様（AddRecipe/RemoveRecipe UseCase・
// Domain の canChangeRecipes）に合わせ、進行中の週（completed 以外）は編集可。過去分（completed）
// のみ不可。UI 側でも同じ条件でボタンを出し分ける（422 の誤操作防止）。
export function canEditPlannedRecipes(status: MealPlanDto['status']): boolean {
  return status !== 'completed';
}

function formatDatePart(date: Date): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekday}）`;
}

// weekIdentifier "2026-07-04" → 「7/4（土）〜7/10（金）」。
// Date 構築は meal-plan-core 設計 4-6 と同一のローカルタイム規約（'T00:00:00' 付与）。
export function formatWeekRange(weekIdentifier: string): string {
  const startDate = new Date(`${weekIdentifier}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  return `${formatDatePart(startDate)}〜${formatDatePart(endDate)}`;
}

// Map に無い recipeId = 削除済みレシピと判定する（S-5）。
export function buildRecipeNameMap(recipes: RecipeDto[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const recipe of recipes) {
    map.set(recipe.id, recipe.name);
  }
  return map;
}

// history の `?limit=` を 1〜12 に clamp する。非整数・省略時は既定値 4。
export function resolveHistoryLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return 4;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return 4;
  }

  return Math.min(Math.max(parsed, 1), 12);
}
