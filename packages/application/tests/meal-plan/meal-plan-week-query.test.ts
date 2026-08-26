import { WeekIdentifier } from '@cookpit/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentWeekIdentifier,
  resolveMealPlanWeekQuery,
} from '../../src/meal-plan/meal-plan-week-query';

const asOf = new Date('2026-07-10T10:00:00');

describe('meal-plan week query', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('MPWQ-01: 有効な土曜日付を selected に採用する', () => {
    const result = resolveMealPlanWeekQuery('2026-07-11', asOf);

    expect(result.selectedWeekIdentifier).toBe('2026-07-11');
  });

  it('MPWQ-02: asOf 指定時の現在週を算出する', () => {
    expect(currentWeekIdentifier(asOf)).toBe('2026-07-04');
  });

  it('MPWQ-03: 戻り値は4つの週識別子だけを含む', () => {
    expect(resolveMealPlanWeekQuery('2026-07-11', asOf)).toEqual({
      currentWeekIdentifier: '2026-07-04',
      selectedWeekIdentifier: '2026-07-11',
      previousWeekIdentifier: '2026-07-04',
      nextWeekIdentifier: '2026-07-18',
    });
  });

  it('MPWQ-04: raw が undefined の場合は現在週にフォールバックする', () => {
    const result = resolveMealPlanWeekQuery(undefined, asOf);

    expect(result.selectedWeekIdentifier).toBe(result.currentWeekIdentifier);
    expect(result.selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-05: スラッシュ区切りの raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('2026/07/04', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-06: ゼロ埋めされていない raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('2026-7-4', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-07: 空文字の raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-08: ゴミ文字列の raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('garbage', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-09: 日曜日の raw を直前の土曜日へスナップする', () => {
    expect(resolveMealPlanWeekQuery('2026-07-05', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-10: 金曜日の raw を直前の土曜日へスナップする', () => {
    expect(resolveMealPlanWeekQuery('2026-07-10', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-11: 年またぎの raw を前年の土曜日へスナップする', () => {
    expect(resolveMealPlanWeekQuery('2027-01-01', asOf).selectedWeekIdentifier).toBe('2026-12-26');
  });

  it('MPWQ-12: 末尾に余分な文字がある raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('2026-07-04x', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-13: 先頭に余分な文字がある raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('x2026-07-04', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-14: Invalid Date の raw は現在週にフォールバックする', () => {
    expect(resolveMealPlanWeekQuery('2026-99-99', asOf).selectedWeekIdentifier).toBe('2026-07-04');
  });

  it('MPWQ-15: overflow する raw は Domain の日付結果を採用する', () => {
    const raw = '2026-02-30';
    const expected = WeekIdentifier.fromDate(new Date(`${raw}T00:00:00`)).toString();

    expect(resolveMealPlanWeekQuery(raw, asOf).selectedWeekIdentifier).toBe(expected);
    expect(expected).not.toBe('2026-07-04');
  });

  it('MPWQ-16: 土曜日付の selected に対する previous と next は ±7日になる', () => {
    const result = resolveMealPlanWeekQuery('2026-07-11', asOf);

    expect({
      previousWeekIdentifier: result.previousWeekIdentifier,
      nextWeekIdentifier: result.nextWeekIdentifier,
    }).toEqual({
      previousWeekIdentifier: '2026-07-04',
      nextWeekIdentifier: '2026-07-18',
    });
  });

  it('MPWQ-17: previous と next はスナップ後の selected を基準にする', () => {
    const result = resolveMealPlanWeekQuery('2026-07-13', asOf);

    expect({
      selectedWeekIdentifier: result.selectedWeekIdentifier,
      previousWeekIdentifier: result.previousWeekIdentifier,
      nextWeekIdentifier: result.nextWeekIdentifier,
    }).toEqual({
      selectedWeekIdentifier: '2026-07-11',
      previousWeekIdentifier: '2026-07-04',
      nextWeekIdentifier: '2026-07-18',
    });
  });

  it('MPWQ-18: selected のスナップ結果は Domain の計算結果と一致する', () => {
    const raw = '2026-07-10';
    const expected = WeekIdentifier.fromDate(new Date(`${raw}T00:00:00`)).toString();

    expect(resolveMealPlanWeekQuery(raw, asOf).selectedWeekIdentifier).toBe(expected);
  });

  it('MPWQ-19: asOf を省略した currentWeekIdentifier は現在時刻を使う', () => {
    vi.useFakeTimers();
    vi.setSystemTime(asOf);

    expect(currentWeekIdentifier()).toBe('2026-07-04');
  });

  it('MPWQ-20: asOf を省略した resolve のフォールバックは currentWeekIdentifier と一致する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(asOf);

    const result = resolveMealPlanWeekQuery(undefined);

    expect(result.currentWeekIdentifier).toBe(result.selectedWeekIdentifier);
    expect(result.currentWeekIdentifier).toBe(currentWeekIdentifier());
    expect(result.currentWeekIdentifier).toBe('2026-07-04');
  });
});
