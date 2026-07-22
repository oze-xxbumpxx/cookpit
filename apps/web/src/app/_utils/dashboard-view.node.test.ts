import type { StockDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  MEAL_PLAN_STATUS_LABELS,
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
  selectExpiringStocks,
} from './dashboard-view';

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

describe('getExpiryRemainingDays', () => {
  const asOf = new Date('2026-07-21T09:00:00');

  it('EU-01: 当日は 0 を返す', () => {
    expect(getExpiryRemainingDays('2026-07-21', asOf)).toBe(0);
  });

  it('EU-02: 翌日は 1 を返す', () => {
    expect(getExpiryRemainingDays('2026-07-22', asOf)).toBe(1);
  });

  it('EU-03: 1 日前（期限切れ）は -1 を返す', () => {
    expect(getExpiryRemainingDays('2026-07-20', asOf)).toBe(-1);
  });

  it('EU-04: 大幅に過去の期限切れは負の日数を返す', () => {
    expect(getExpiryRemainingDays('2026-07-01', asOf)).toBe(-20);
  });

  it('EU-05: 月またぎでも正しい残日数を返す', () => {
    expect(getExpiryRemainingDays('2026-08-01', new Date('2026-07-31T09:00:00'))).toBe(1);
  });

  it('EU-06: 年またぎでも正しい残日数を返す', () => {
    expect(getExpiryRemainingDays('2027-01-01', new Date('2026-12-31T09:00:00'))).toBe(1);
  });

  it('EU-07: asOf の時刻成分に依存しない（ローカル 0 時基準）', () => {
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-21T00:00:00'))).toBe(1);
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-21T09:00:00'))).toBe(1);
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-21T23:59:59'))).toBe(1);
  });

  it('EU-08: 不正な expiresAt 文字列でも例外を投げない', () => {
    expect(() => getExpiryRemainingDays('', asOf)).not.toThrow();
    expect(Number.isNaN(getExpiryRemainingDays('', asOf))).toBe(true);
  });
});

describe('getExpiryUrgency', () => {
  it('EU-09: 1→2 で critical から soon に切り替わる', () => {
    expect(getExpiryUrgency(1)).toBe('critical');
    expect(getExpiryUrgency(2)).toBe('soon');
  });

  it('EU-10: -1→0 で overdue から critical に切り替わる', () => {
    expect(getExpiryUrgency(-1)).toBe('overdue');
    expect(getExpiryUrgency(0)).toBe('critical');
  });

  it('EU-11: 上限境界（3 日）は soon', () => {
    expect(getExpiryUrgency(3)).toBe('soon');
  });

  it('EU-12: 範囲外入力（4 日以上）でも例外を投げず soon に収束する', () => {
    expect(getExpiryUrgency(4)).toBe('soon');
    expect(getExpiryUrgency(100)).toBe('soon');
  });
});

describe('formatExpiryUrgencyLabel', () => {
  it('EU-13: 期限切れ', () => {
    expect(formatExpiryUrgencyLabel(-1)).toBe('期限切れ');
  });

  it('EU-14: 本日まで', () => {
    expect(formatExpiryUrgencyLabel(0)).toBe('本日まで');
  });

  it('EU-15: 明日まで', () => {
    expect(formatExpiryUrgencyLabel(1)).toBe('明日まで');
  });

  it('EU-16: あと2日', () => {
    expect(formatExpiryUrgencyLabel(2)).toBe('あと2日');
  });

  it('EU-17: あと3日', () => {
    expect(formatExpiryUrgencyLabel(3)).toBe('あと3日');
  });

  it('EU-18: urgency と label が P-4/P-6 の対応どおり連動する', () => {
    const cases: {
      remainingDays: number;
      urgency: ReturnType<typeof getExpiryUrgency>;
      label: string;
    }[] = [
      { remainingDays: -3, urgency: 'overdue', label: '期限切れ' },
      { remainingDays: 0, urgency: 'critical', label: '本日まで' },
      { remainingDays: 1, urgency: 'critical', label: '明日まで' },
      { remainingDays: 2, urgency: 'soon', label: 'あと2日' },
      { remainingDays: 3, urgency: 'soon', label: 'あと3日' },
    ];

    for (const { remainingDays, urgency, label } of cases) {
      expect(getExpiryUrgency(remainingDays)).toBe(urgency);
      expect(formatExpiryUrgencyLabel(remainingDays)).toBe(label);
    }
  });
});
