#!/usr/bin/env node
// ハーネスの「今日」とgitの日付窓。UTCのtoISOString().slice(0, 10)や
// `date +%F`（TZ未指定）と混ぜると、JST 0〜9時に日付が1日ずれる。
//
// 既定タイムゾーンはAsia/Tokyo。HARNESS_TZ（旧COOKPIT_TZ）で上書きする。
// harness-paths.mjsには置かない（状態ディレクトリ解決と日付は別責務）。

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function harnessTz(env = process.env) {
  return env.HARNESS_TZ || env.COOKPIT_TZ || 'Asia/Tokyo';
}

/**
 * `date`が`tz`で何日か（YYYY-MM-DD）。en-CAはISO日付を返す。
 * @param {Date} [date]
 * @param {string} [tz]
 * @returns {string}
 */
export function dayInTz(date = new Date(), tz = harnessTz()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

/** dayInTzの別名（「今日」を取る意図が読み手に分かるとき用）。 */
export function todayInTz(date = new Date(), tz = harnessTz()) {
  return dayInTz(date, tz);
}

/**
 * IANAタイムゾーンのUTCオフセットをISO 8601（±HH:MM）で返す。
 * @param {Date} date
 * @param {string} tz
 * @returns {string}
 */
export function tzOffsetIso(date, tz) {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  if (name === 'GMT' || name === 'UTC') return '+00:00';
  const match =
    name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/) ||
    name.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '+00:00';
  return `${match[1]}${match[2].padStart(2, '0')}:${(match[3] || '00').padStart(2, '0')}`;
}

/**
 * YYYY-MM-DDの翌日（グレゴリオ暦の日付加算。TZ非依存）。
 * @param {string} day
 * @returns {string}
 */
export function nextCalendarDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/**
 * git logの --since / --untilに渡す、その暦日の境界。
 * sinceはその日の00:00:00（そのTZ）、untilは翌日00:00:00。
 * gitの --untilはその時刻を含むことがあるので、呼び出し側でdayInTzによる再フィルタを残す。
 *
 * @param {string} day YYYY-MM-DD
 * @param {string} [tz]
 * @returns {{ since: string, until: string }}
 */
export function gitDayRange(day, tz = harnessTz()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`invalid day: ${day}`);
  }
  const probes = [new Date(`${day}T00:00:00.000Z`), new Date(`${day}T12:00:00.000Z`)];
  const probe = probes.find((candidate) => dayInTz(candidate, tz) === day) ?? probes[1];
  const offset = tzOffsetIso(probe, tz);
  return {
    since: `${day}T00:00:00${offset}`,
    until: `${nextCalendarDay(day)}T00:00:00${offset}`,
  };
}
