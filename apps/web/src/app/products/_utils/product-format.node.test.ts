import type { PriceRecordDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  findLatestPriceRecord,
  formatDate,
  formatDateTime,
  formatYen,
  sortPriceHistoryByObservedAt,
  unitPriceBasisLabel,
} from './product-format';

function createPriceRecord(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 198,
    unitPriceAmount: 99,
    packageSizeValue: 200,
    packageSizeUnit: 'g',
    observedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findLatestPriceRecord', () => {
  it('PF-01: 空配列のときは null を返す', () => {
    expect(findLatestPriceRecord([])).toBeNull();
  });

  it('PF-02: 順不同の入力でも observedAt が最新のレコードを返す', () => {
    const latest = createPriceRecord({
      storeId: 'store-b',
      observedAt: '2026-06-15T00:00:00.000Z',
    });
    const records = [
      createPriceRecord({ observedAt: '2026-06-10T00:00:00.000Z' }),
      latest,
      createPriceRecord({ observedAt: '2026-06-01T00:00:00.000Z' }),
    ];

    expect(findLatestPriceRecord(records)).toBe(latest);
  });

  it('PF-07: observedAt がパース不能なレコードは最新扱いにならない', () => {
    const valid = createPriceRecord({ observedAt: '2026-06-01T00:00:00.000Z' });
    const broken = createPriceRecord({ storeId: 'store-b', observedAt: 'not-a-date' });

    expect(findLatestPriceRecord([broken, valid])).toBe(valid);
  });
});

describe('sortPriceHistoryByObservedAt', () => {
  it('PF-03: observedAt 昇順にソートし、元配列は変更しない', () => {
    const older = createPriceRecord({ observedAt: '2026-06-01T00:00:00.000Z' });
    const newer = createPriceRecord({ observedAt: '2026-06-15T00:00:00.000Z' });
    const source = [newer, older];

    const sorted = sortPriceHistoryByObservedAt(source);

    expect(sorted).toEqual([older, newer]);
    expect(source).toEqual([newer, older]);
  });
});

describe('formatYen', () => {
  it('PF-04: 3 桁区切り + 「円」で整形する', () => {
    expect(formatYen(1234)).toBe('1,234円');
    expect(formatYen(0)).toBe('0円');
  });
});

describe('formatDate / formatDateTime', () => {
  it('PF-05: 不正な日付文字列は原文をそのまま返す', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });

  it('PF-05b: 有効な日付は月日（+時刻）形式に整形される', () => {
    expect(formatDate('2026-06-01T09:30:00.000Z')).toMatch(/^\d{1,2}\/\d{1,2}$/);
    expect(formatDateTime('2026-06-01T09:30:00.000Z')).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });
});

describe('unitPriceBasisLabel', () => {
  it('PF-06: g/kg は 100g、ml/l は 100ml、それ以外は 1<単位> を返す', () => {
    expect(unitPriceBasisLabel('g')).toBe('100g');
    expect(unitPriceBasisLabel('kg')).toBe('100g');
    expect(unitPriceBasisLabel('ml')).toBe('100ml');
    expect(unitPriceBasisLabel('l')).toBe('100ml');
    expect(unitPriceBasisLabel('個')).toBe('1個');
  });
});
