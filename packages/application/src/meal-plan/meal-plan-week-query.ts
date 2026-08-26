import { WeekIdentifier } from '@cookpit/domain';
import type { MealPlanWeekSelection } from './meal-plan.dto';

const WEEK_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns the week identifier for the week containing the given date.
 * Weeks start on Saturday; non-Saturday dates snap to the preceding Saturday
 * through the Domain `WeekIdentifier` invariant.
 */
export function currentWeekIdentifier(asOf?: Date): string {
  return WeekIdentifier.fromDate(asOf ?? new Date()).toString();
}

/**
 * Resolves a `?week=` query into the current, selected, previous, and next
 * week identifiers.
 *
 * Undefined, malformed, or Invalid Date query values fall back to the current
 * week. Valid dates snap to the preceding Saturday through the Domain
 * `WeekIdentifier` invariant.
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
