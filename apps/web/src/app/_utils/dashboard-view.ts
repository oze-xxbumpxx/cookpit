import type { MealPlanStatus, StockDto } from '@cookpit/application';

export const MEAL_PLAN_STATUS_LABELS: Record<MealPlanStatus, string> = {
  draft: '献立作成中',
  shopping: '買い物中',
  cooking: '調理中',
  consuming: '消費中',
  completed: '完了',
};

// expiresAt("YYYY-MM-DD") をローカル 0 時基準の Date にする（UTC 変換による日付ずれ回避・
// meal-plan-view / pantry.mapper と同一のローカルタイム規約）。
function parseExpiryDate(expiresAt: string): Date {
  return new Date(`${expiresAt}T00:00:00`);
}

function toLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 当日（asOf）から `withinDays` 日以内に賞味期限を迎える在庫を、賞味期限の昇順で返す。
 *
 * - 期限切れ（asOf より過去）の在庫も含める。
 * - 閾値ちょうど（asOf + withinDays）は含む（境界は inclusive）。
 * - `expiresAt` が null の在庫は対象外。
 */
export function selectExpiringStocks(
  stocks: StockDto[],
  asOf: Date,
  withinDays: number,
): StockDto[] {
  const threshold = toLocalMidnight(asOf);
  threshold.setDate(threshold.getDate() + withinDays);

  return stocks
    .filter((stock): stock is StockDto & { expiresAt: string } => stock.expiresAt !== null)
    .filter((stock) => parseExpiryDate(stock.expiresAt) <= threshold)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
