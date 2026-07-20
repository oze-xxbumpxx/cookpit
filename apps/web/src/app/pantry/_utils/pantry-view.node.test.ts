import type { StockDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import { formatExpiresAt, groupStocksByLocation } from './pantry-view';

function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: '3b8c1165-8fc3-4fd2-96b6-a31dd2d78cc5',
    productId: null,
    displayName: '牛乳',
    amount: { value: 1000, unit: 'ml' },
    purchasedAt: '2026-07-11T01:00:00.000Z',
    expiresAt: null,
    storedLocation: null,
    ...overrides,
  };
}

describe('groupStocksByLocation', () => {
  it('PV-01: 4ロケーション混在でも固定順でグループを返す', () => {
    const stocks = [
      createStockDto({ id: '00000000-0000-4000-8000-000000000004', storedLocation: null }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000003',
        storedLocation: 'pantry',
      }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000002',
        storedLocation: 'freezer',
      }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000001',
        storedLocation: 'fridge',
      }),
    ];

    const groups = groupStocksByLocation(stocks);

    expect(groups.map((group) => group.location)).toEqual(['fridge', 'freezer', 'pantry', null]);
  });

  it('PV-02: 在庫があるロケーションのグループだけを返す', () => {
    const stocks = [
      createStockDto({ id: '00000000-0000-4000-8000-000000000001', storedLocation: 'fridge' }),
      createStockDto({ id: '00000000-0000-4000-8000-000000000002', storedLocation: null }),
    ];

    const groups = groupStocksByLocation(stocks);

    expect(groups.map((group) => group.location)).toEqual(['fridge', null]);
  });

  it('PV-03: 全件が保存場所未設定なら単一グループを返す', () => {
    const stocks = [
      createStockDto({ id: '00000000-0000-4000-8000-000000000001' }),
      createStockDto({ id: '00000000-0000-4000-8000-000000000002' }),
    ];

    const groups = groupStocksByLocation(stocks);

    expect(groups).toEqual([
      {
        location: null,
        label: '保存場所未設定',
        stocks,
      },
    ]);
  });

  it('PV-04: 空配列なら空配列を返す', () => {
    expect(groupStocksByLocation([])).toEqual([]);
  });

  it('PV-05: 同一ロケーション内では入力順を維持する', () => {
    const stocks = [
      createStockDto({
        id: '00000000-0000-4000-8000-000000000001',
        displayName: '牛乳',
        storedLocation: 'fridge',
      }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000002',
        displayName: '卵',
        storedLocation: 'fridge',
      }),
    ];

    const groups = groupStocksByLocation(stocks);

    expect(groups[0]?.stocks.map((stock) => stock.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('PV-06: 全ロケーションのラベルを返す', () => {
    const stocks = [
      createStockDto({ id: '00000000-0000-4000-8000-000000000001', storedLocation: 'fridge' }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000002',
        storedLocation: 'freezer',
      }),
      createStockDto({
        id: '00000000-0000-4000-8000-000000000003',
        storedLocation: 'pantry',
      }),
      createStockDto({ id: '00000000-0000-4000-8000-000000000004', storedLocation: null }),
    ];

    const groups = groupStocksByLocation(stocks);

    expect(groups.map(({ location, label }) => ({ location, label }))).toEqual([
      { location: 'fridge', label: '冷蔵' },
      { location: 'freezer', label: '冷凍' },
      { location: 'pantry', label: '常温' },
      { location: null, label: '保存場所未設定' },
    ]);
  });
});

describe('formatExpiresAt', () => {
  it('PV-07: 月日をゼロ埋めせず整形する', () => {
    expect(formatExpiresAt('2026-08-01')).toBe('8/1まで');
  });

  it('PV-08: 年末と年始の日付を整形する', () => {
    expect(formatExpiresAt('2026-12-31')).toBe('12/31まで');
    expect(formatExpiresAt('2027-01-01')).toBe('1/1まで');
  });
});
