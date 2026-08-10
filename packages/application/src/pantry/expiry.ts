import type { StockDto } from './pantry.dto';

/** 賞味期限を「近い」と扱う閾値（日数）。ダッシュボードと /pantry で共有する。 */
export const EXPIRY_URGENCY_WITHIN_DAYS = 3;

/**
 * 期限判定の基準タイムゾーン（P-5 改め。2026-08-10 確定）。
 *
 * 当初は `TZ=Asia/Tokyo` を Vercel の環境変数で設定してサーバの実行時 TZ を固定する方針
 * だったが、**`TZ` は Vercel の予約環境変数で設定できない**（AWS Lambda が定義済み）。
 * そのため実行時 TZ に依存しない形で JST をコード上に明示する。
 *
 * 実行時 TZ に依存すると、Cron が UTC 23:00（= JST 08:00）に発火するため「今日」が
 * JST の前日と判定され、**「本日まで」の在庫が「明日まで」として通知され、3 日間の窓も
 * 1 日短くなる**（要件 FR-6・罠 5）。
 */
const EXPIRY_TIME_ZONE = 'Asia/Tokyo';

// `en-CA` ロケールは YYYY-MM-DD 形式を返すため、日付文字列を直接得られる。
const jstDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EXPIRY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 任意の時点を JST の暦日（`YYYY-MM-DD`）へ変換する。
 *
 * 実行時 TZ に依存しない。`expiresAt` と同じ形式に揃えることで、以降の比較を
 * 文字列と UTC 基準の Date だけで完結させる。
 */
export function toJstDateString(date: Date): string {
  return jstDateFormatter.format(date);
}

/**
 * `YYYY-MM-DD` を UTC 0 時基準の `Date` にする。
 *
 * 実行時 TZ に依存しない（`new Date('2026-08-10T00:00:00')` は実行時 TZ で解釈されるため
 * 使わない）。**暦日どうしの差分を取るための内部表現**であり、実時刻を表すものではない。
 */
export function parseExpiryDate(expiresAt: string): Date {
  // 要素が欠ける不正な入力（例: 空文字）では `Number(undefined)` が NaN になり、
  // `Date.UTC` 全体が NaN → Invalid Date になる。呼び出し側は `getTime()` の NaN で
  // 検知する（例外は投げない。EU-08）。
  const [year, month, day] = expiresAt.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** `asOf` を JST の暦日に丸め、UTC 0 時基準の `Date` として返す。 */
export function toLocalMidnight(date: Date): Date {
  return parseExpiryDate(toJstDateString(date));
}

export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';

/**
 * `asOf` から `expiresAt` までの残日数を返す（負値は期限切れ日数）。
 *
 * 基準は **JST の暦日**。実行時 TZ には依存しない。
 */
export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
  const diff = parseExpiryDate(expiresAt).getTime() - toLocalMidnight(asOf).getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

/**
 * 残日数を 3 段階の緊急度に分類する。
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

/** 残日数を人間可読な文言に変換する。日次ダイジェスト通知の本文（SendExpiryAlertsUseCase）でも使う。 */
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

/**
 * 当日（asOf）から `withinDays` 日以内に賞味期限を迎える在庫を、賞味期限の昇順で返す。
 *
 * - 基準は **JST の暦日**。実行時 TZ には依存しない。
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
  threshold.setUTCDate(threshold.getUTCDate() + withinDays);

  return stocks
    .filter((stock): stock is StockDto & { expiresAt: string } => stock.expiresAt !== null)
    .filter((stock) => parseExpiryDate(stock.expiresAt) <= threshold)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
