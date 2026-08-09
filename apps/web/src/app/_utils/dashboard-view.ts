import type { MealPlanStatus, StockDto } from '@cookpit/application';
import { parseExpiryDate, toLocalMidnight } from './expiry';

export const MEAL_PLAN_STATUS_LABELS: Record<MealPlanStatus, string> = {
  draft: '献立作成中',
  shopping: '買い物中',
  cooking: '調理中',
  consuming: '消費中',
  completed: '完了',
};

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
