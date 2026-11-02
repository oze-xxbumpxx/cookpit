// harness-time.mjs — HARNESS_TZでの「今日」とgitの暦日窓。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayInTz, gitDayRange, harnessTz, nextCalendarDay, tzOffsetIso } from '../lib/harness-time.mjs';

test('harnessTz は HARNESS_TZ → COOKPIT_TZ → Asia/Tokyo の順', () => {
  assert.equal(harnessTz({}), 'Asia/Tokyo');
  assert.equal(harnessTz({ COOKPIT_TZ: 'UTC' }), 'UTC');
  assert.equal(harnessTz({ HARNESS_TZ: 'America/Los_Angeles', COOKPIT_TZ: 'UTC' }), 'America/Los_Angeles');
});

test('JST 0〜9 時は UTC 日付とずれる（toISOString の罠）', () => {
  const utcEvening = new Date('2026-01-01T15:00:00.000Z');
  assert.equal(utcEvening.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(dayInTz(utcEvening, 'Asia/Tokyo'), '2026-01-02');
  assert.equal(dayInTz(utcEvening, 'UTC'), '2026-01-01');
});

test('tzOffsetIso は IANA 名から ±HH:MM を返す', () => {
  assert.equal(tzOffsetIso(new Date('2026-01-15T12:00:00Z'), 'Asia/Tokyo'), '+09:00');
  assert.equal(tzOffsetIso(new Date('2026-01-15T12:00:00Z'), 'UTC'), '+00:00');
  assert.equal(tzOffsetIso(new Date('2026-01-15T12:00:00Z'), 'America/Los_Angeles'), '-08:00');
  assert.equal(tzOffsetIso(new Date('2026-07-15T12:00:00Z'), 'America/Los_Angeles'), '-07:00');
});

test('nextCalendarDay は日付文字列を 1 日進める', () => {
  assert.equal(nextCalendarDay('2026-01-31'), '2026-02-01');
  assert.equal(nextCalendarDay('2024-02-29'), '2024-03-01');
});

test('gitDayRange は対象日の 00:00 から翌日 00:00（その TZ）', () => {
  assert.deepEqual(gitDayRange('2020-01-15', 'Asia/Tokyo'), {
    since: '2020-01-15T00:00:00+09:00',
    until: '2020-01-16T00:00:00+09:00',
  });
  assert.deepEqual(gitDayRange('2020-01-15', 'UTC'), {
    since: '2020-01-15T00:00:00+00:00',
    until: '2020-01-16T00:00:00+00:00',
  });
});

test('gitDayRange は不正な日付を拒否する', () => {
  assert.throws(() => gitDayRange('yesterday'), /invalid day/);
});
