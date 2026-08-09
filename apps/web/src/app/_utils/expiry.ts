/** 賞味期限を「近い」と扱う閾値（日数）。ダッシュボードと /pantry で共有する。 */
export const EXPIRY_URGENCY_WITHIN_DAYS = 3;

// expiresAt("YYYY-MM-DD") をローカル 0 時基準の Date にする（UTC 変換による日付ずれ回避・
// meal-plan-view / pantry.mapper と同一のローカルタイム規約）。
export function parseExpiryDate(expiresAt: string): Date {
  return new Date(`${expiresAt}T00:00:00`);
}

export function toLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
