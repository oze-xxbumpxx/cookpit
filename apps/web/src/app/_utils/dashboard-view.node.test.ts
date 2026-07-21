import type { StockDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import { MEAL_PLAN_STATUS_LABELS, selectExpiringStocks } from './dashboard-view';

function createStock(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: overrides.id ?? 'stock-1',
    productId: overrides.productId ?? null,
    displayName: overrides.displayName ?? '牛乳',
    amount: overrides.amount ?? { value: 1, unit: '本' },
    purchasedAt: overrides.purchasedAt ?? '2026-07-18T00:00:00.000Z',
    expiresAt: overrides.expiresAt ?? null,
    storedLocation: overrides.storedLocation ?? 'fridge',
  };
}

describe('selectExpiringStocks', () => {
  const asOf = new Date('2026-07-21T09:00:00');

  it('賞味期限が閾値以内の在庫を賞味期限の昇順で返す', () => {
    const stocks = [
      createStock({ id: 'a', expiresAt: '2026-07-24' }),
      createStock({ id: 'b', expiresAt: '2026-07-22' }),
      createStock({ id: 'c', expiresAt: '2026-07-23' }),
    ];

    const result = selectExpiringStocks(stocks, asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['b', 'c', 'a']);
  });

  it('閾値ちょうど（asOf + withinDays）の在庫は含む', () => {
    const stocks = [createStock({ id: 'boundary', expiresAt: '2026-07-24' })];

    const result = selectExpiringStocks(stocks, asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['boundary']);
  });

  it('閾値を超える在庫は除外する', () => {
    const stocks = [createStock({ id: 'far', expiresAt: '2026-07-25' })];

    const result = selectExpiringStocks(stocks, asOf, 3);

    expect(result).toEqual([]);
  });

  it('当日・期限切れの在庫も含める', () => {
    const stocks = [
      createStock({ id: 'today', expiresAt: '2026-07-21' }),
      createStock({ id: 'overdue', expiresAt: '2026-07-19' }),
    ];

    const result = selectExpiringStocks(stocks, asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['overdue', 'today']);
  });

  it('expiresAt が null の在庫は対象外', () => {
    const stocks = [
      createStock({ id: 'no-expiry', expiresAt: null }),
      createStock({ id: 'soon', expiresAt: '2026-07-22' }),
    ];

    const result = selectExpiringStocks(stocks, asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['soon']);
  });
});

describe('MEAL_PLAN_STATUS_LABELS', () => {
  it('全ステータスに日本語ラベルがある', () => {
    expect(MEAL_PLAN_STATUS_LABELS.draft).toBe('献立作成中');
    expect(MEAL_PLAN_STATUS_LABELS.shopping).toBe('買い物中');
    expect(MEAL_PLAN_STATUS_LABELS.cooking).toBe('調理中');
    expect(MEAL_PLAN_STATUS_LABELS.consuming).toBe('消費中');
    expect(MEAL_PLAN_STATUS_LABELS.completed).toBe('完了');
  });
});
