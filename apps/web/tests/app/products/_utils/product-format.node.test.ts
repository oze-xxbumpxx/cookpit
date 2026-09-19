import type { PriceRecordDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  findLatestPriceRecord,
  formatDate,
  formatDateTime,
  formatUnitPrice,
  formatYen,
  sortPriceHistoryByObservedAt,
} from '../../../../src/app/products/_utils/product-format';

function createPriceRecord(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
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

  // 以下は JST 固定の回帰テスト。形状だけを見る PF-05b は実行時 TZ に関わらず通るため、
  // サーバ（UTC）とクライアント（JST）で表示がずれるハイドレーション不整合を検知できなかった。
  // 値を JST で固定することで、`timeZone` 指定が外れたら UTC 実行環境で落ちる。
  it('PF-05c: 瞬時値は JST で整形される（実行時 TZ に依存しない）', () => {
    // UTC 09:30 は JST 18:30。TZ 未指定だと UTC 実行環境では '6/1 09:30' になる。
    expect(formatDateTime('2026-06-01T09:30:00.000Z')).toBe('6/1 18:30');
    expect(formatDate('2026-06-01T09:30:00.000Z')).toBe('6/1');
  });

  it('PF-05d: JST で日付が繰り上がる瞬時値でも暦日がずれない', () => {
    // UTC 6/1 15:30 は JST 6/2 00:30。TZ 未指定だと日付そのものが 1 日ずれる。
    expect(formatDateTime('2026-06-01T15:30:00.000Z')).toBe('6/2 00:30');
    expect(formatDate('2026-06-01T15:30:00.000Z')).toBe('6/2');
  });
});

describe('formatUnitPrice', () => {
  // 仕様変更（2026-07-27）: kg/l で記録したものは 100g/100ml ではなく 1kg/1L 基準で表示する。
  // 旧 unitPriceBasisLabel は kg でも '100g' を返していた。
  it('PF-06: 表示基準は内容量の単位から決まる（g→100g / kg→1kg / ml→100ml / l→1L）', () => {
    expect(formatUnitPrice(1, 'g')).toBe('1円 / 100g');
    expect(formatUnitPrice(1, 'kg')).toBe('10円 / 1kg');
    expect(formatUnitPrice(1, 'ml')).toBe('1円 / 100ml');
    expect(formatUnitPrice(1, 'l')).toBe('10円 / 1L');
    expect(formatUnitPrice(1, '個')).toBe('1円 / 1個');
  });

  it('PF-06b: 大文字・全角などの表記ゆれは「その他」として扱う（UnitPriceCalculator と同じ厳密一致）', () => {
    // 正準化側が 1 単位あたりで計算しているので、表示側も換算せず「1KG あたり」で出す。
    // ここで正規化して 10 倍すると単価が 10 倍ズレる。
    expect(formatUnitPrice(1, 'KG')).toBe('1円 / 1KG');
    expect(formatUnitPrice(1, 'ｇ')).toBe('1円 / 1ｇ');
  });

  it('PF-08: kg / l は保存値（100g・100ml 基準）を 10 倍して表示する', () => {
    expect(formatUnitPrice(29.8, 'kg')).toBe('298円 / 1kg');
    expect(formatUnitPrice(15, 'l')).toBe('150円 / 1L');
  });

  it('PF-09: g / ml は保存値をそのまま 100g・100ml 基準で表示する', () => {
    expect(formatUnitPrice(99, 'g')).toBe('99円 / 100g');
    expect(formatUnitPrice(12.5, 'ml')).toBe('12.5円 / 100ml');
  });

  it('PF-10: g/kg/ml/l 以外は保存値をそのまま 1 単位あたりで表示する', () => {
    expect(formatUnitPrice(48, '個')).toBe('48円 / 1個');
    expect(formatUnitPrice(48, 'KG')).toBe('48円 / 1KG');
  });

  it('PF-11: 換算結果は 0.1 単位へ丸める（浮動小数の桁あふれを出さない）', () => {
    expect(formatUnitPrice(33.3, 'kg')).toBe('333円 / 1kg');
    expect(formatUnitPrice(0.07, 'kg')).toBe('0.7円 / 1kg');
  });
});
