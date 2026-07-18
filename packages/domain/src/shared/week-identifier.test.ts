import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekIdentifier } from './week-identifier';

const expectLocalDateTime = (
  date: Date,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): void => {
  expect(date.getFullYear()).toBe(year);
  expect(date.getMonth() + 1).toBe(month);
  expect(date.getDate()).toBe(day);
  expect(date.getHours()).toBe(hour);
  expect(date.getMinutes()).toBe(minute);
  expect(date.getSeconds()).toBe(second);
  expect(date.getMilliseconds()).toBe(millisecond);
};

describe('WeekIdentifier', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('土曜 00:00:00 は当日を週開始日にする', () => {
    const date = new Date('2026-07-04T00:00:00');
    const week = WeekIdentifier.fromDate(date);

    expect(week.startDate().getTime()).toBe(date.getTime());
    expect(week.toString()).toBe('2026-07-04');
  });

  it('土曜 23:59:59.999 は同じ土曜を週開始日にする', () => {
    const week = WeekIdentifier.fromDate(new Date('2026-07-04T23:59:59.999'));

    expectLocalDateTime(week.startDate(), 2026, 7, 4, 0, 0, 0, 0);
    expect(week.equals(WeekIdentifier.fromDate(new Date('2026-07-04T00:00:00')))).toBe(true);
  });

  it('金曜 23:59:59.999 は直前の土曜を週開始日にする', () => {
    const week = WeekIdentifier.fromDate(new Date('2026-07-10T23:59:59.999'));

    expectLocalDateTime(week.startDate(), 2026, 7, 4, 0, 0, 0, 0);
    expect(week.toString()).toBe('2026-07-04');
  });

  it('日曜から木曜も同じ土曜始まり週に属する', () => {
    const dates = [
      '2026-07-05T12:00:00',
      '2026-07-06T12:00:00',
      '2026-07-07T12:00:00',
      '2026-07-08T12:00:00',
      '2026-07-09T12:00:00',
    ];

    for (const date of dates) {
      expect(WeekIdentifier.fromDate(new Date(date)).toString()).toBe('2026-07-04');
    }
  });

  it('fromDate は引数の Date を変更しない', () => {
    const date = new Date('2026-07-10T23:59:59.999');

    WeekIdentifier.fromDate(date);

    expectLocalDateTime(date, 2026, 7, 10, 23, 59, 59, 999);
  });

  it('current は現在日時が土曜ならその日を週開始日にする', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T10:00:00'));

    expect(WeekIdentifier.current().toString()).toBe('2026-07-04');
  });

  it('current は現在日時が金曜なら6日前の土曜を週開始日にする', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00'));

    expect(WeekIdentifier.current().toString()).toBe('2026-07-04');
  });

  it('endDate は週開始日 + 6日の 23:59:59.999 を返す', () => {
    const endDate = WeekIdentifier.fromString('2026-07-04').endDate();

    expectLocalDateTime(endDate, 2026, 7, 10, 23, 59, 59, 999);
  });

  it('next は7日後の週を返す', () => {
    expect(WeekIdentifier.fromString('2026-07-04').next().toString()).toBe('2026-07-11');
  });

  it('previous は7日前の週を返す', () => {
    expect(WeekIdentifier.fromString('2026-07-04').previous().toString()).toBe('2026-06-27');
  });

  it('同じ週開始日どうしは equals が true', () => {
    expect(
      WeekIdentifier.fromString('2026-07-04').equals(
        WeekIdentifier.fromDate(new Date('2026-07-04T12:00:00')),
      ),
    ).toBe(true);
  });

  it('異なる週開始日どうしは equals が false', () => {
    expect(
      WeekIdentifier.fromString('2026-07-04').equals(WeekIdentifier.fromString('2026-07-11')),
    ).toBe(false);
  });

  it('年またぎ週は前年の土曜を週開始日にする', () => {
    expect(WeekIdentifier.fromDate(new Date('2027-01-01T00:00:00')).toString()).toBe('2026-12-26');
  });

  it('fromString と toString は土曜入力で YYYY-MM-DD ラウンドトリップする', () => {
    const values = ['2026-07-04', '2026-06-27', '2026-12-26'];

    for (const value of values) {
      expect(WeekIdentifier.fromString(value).toString()).toBe(value);
    }
  });

  it('fromString は非土曜の入力を直前の土曜へスナップする', () => {
    expect(WeekIdentifier.fromString('2026-07-05').toString()).toBe('2026-07-04'); // 日曜
    expect(WeekIdentifier.fromString('2026-07-10').toString()).toBe('2026-07-04'); // 金曜
    expect(WeekIdentifier.fromString('2026-01-01').toString()).toBe('2025-12-27'); // 木曜（前年土曜へ）
  });

  it('toString はローカル日付として週開始日を返す', () => {
    expect(WeekIdentifier.fromString('2026-07-04').toString()).toBe('2026-07-04');
  });

  it('startDate と endDate は防御的コピーを返す', () => {
    const week = WeekIdentifier.fromString('2026-07-04');
    const startDate = week.startDate();
    const endDate = week.endDate();

    startDate.setFullYear(2099);
    endDate.setFullYear(2099);

    expect(week.startDate().getFullYear()).toBe(2026);
    expect(week.endDate().getFullYear()).toBe(2026);
  });
});
