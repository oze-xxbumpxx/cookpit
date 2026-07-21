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

export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';

/**
 * `asOf` から `expiresAt` までの残日数を返す（負値は期限切れ日数）。
 * `selectExpiringStocks` と同一のローカル日付規約（ローカル 0 時基準）に従う。
 */
export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
  const diff = parseExpiryDate(expiresAt).getTime() - toLocalMidnight(asOf).getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

/**
 * 残日数を 3 段階の緊急度に分類する（P-4 の閾値）。
 * `selectExpiringStocks` の 3 日以内フィルタ済みの値を渡す前提のため、4 日以上も `'soon'` に収束する。
 */
export function getExpiryUrgency(remainingDays: number): ExpiryUrgency {
  if (remainingDays < 0) {
    return 'overdue';
  }
  if (remainingDays <= 1) {
    return 'critical';
  }
  return 'soon';
}

/** 残日数を人間可読な文言に変換する（P-6 Option B）。 */
export function formatExpiryUrgencyLabel(remainingDays: number): string {
  if (remainingDays < 0) {
    return '期限切れ';
  }
  if (remainingDays === 0) {
    return '本日まで';
  }
  if (remainingDays === 1) {
    return '明日まで';
  }
  return `あと${remainingDays}日`;
}
