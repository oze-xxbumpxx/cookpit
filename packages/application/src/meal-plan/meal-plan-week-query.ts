import { WeekIdentifier } from '@cookpit/domain';
import type { MealPlanWeekSelection } from './meal-plan.dto';

const WEEK_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * asOf（省略時は現在時刻）が属する週の識別子を返す。
 * 週は土曜開始。非土曜は Domain の WeekIdentifier 不変条件により直前の土曜へスナップする。
 */
export function currentWeekIdentifier(asOf?: Date): string {
  return WeekIdentifier.fromDate(asOf ?? new Date()).toString();
}

/**
 * `?week=` クエリから今週・選択週・前後週の識別子を返す。
 *
 * 未指定・形式不正・Invalid Date は現在週へフォールバックする（壊れた query で 500 にしないため）。
 * 有効日付の土曜スナップは Domain の WeekIdentifier に委譲する。
 * `asOf ?? new Date()` は本関数内で 1 度だけ評価する（current と fallback の基準時刻をずらさないため）。
 */
export function resolveMealPlanWeekQuery(
  raw: string | undefined,
  asOf?: Date,
): MealPlanWeekSelection {
  const current = WeekIdentifier.fromDate(asOf ?? new Date());
  const selected = parseSelectedWeek(raw, current);

  return {
    currentWeekIdentifier: current.toString(),
    selectedWeekIdentifier: selected.toString(),
    previousWeekIdentifier: selected.previous().toString(),
    nextWeekIdentifier: selected.next().toString(),
  };
}

function parseSelectedWeek(raw: string | undefined, fallback: WeekIdentifier): WeekIdentifier {
  if (raw === undefined || !WEEK_QUERY_PATTERN.test(raw)) {
    return fallback;
  }

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return WeekIdentifier.fromDate(date);
}
