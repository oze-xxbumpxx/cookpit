import { describe, expect, it } from 'vitest';
import {
  EXPIRY_URGENCY_WITHIN_DAYS,
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
  selectExpiringStocks,
  toJstDateString,
} from '../../src/pantry/expiry';
import type { StockDto } from '../../src/pantry/pantry.dto';

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

  // 2026-08-10 更新: 基準を「実行時 TZ のローカル 0 時」から「JST の暦日」へ変えたため
  // （P-5 改。TZ が Vercel の予約変数で設定できないことによる）、同じ JST 暦日に写る
  // UTC 時刻を並べる形へ書き直した。JST の 2026-07-21 は
  // UTC 2026-07-20T15:00:00Z 〜 2026-07-21T14:59:59Z に対応する。
  it('EU-07: asOf の時刻成分に依存しない（JST の暦日基準）', () => {
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-20T15:00:00.000Z'))).toBe(1);
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-21T00:00:00.000Z'))).toBe(1);
    expect(getExpiryRemainingDays('2026-07-22', new Date('2026-07-21T14:59:59.000Z'))).toBe(1);
  });

  it('EU-08: 不正な expiresAt 文字列でも例外を投げない', () => {
    expect(() => getExpiryRemainingDays('', asOf)).not.toThrow();
    expect(Number.isNaN(getExpiryRemainingDays('', asOf))).toBe(true);
  });
});

describe('EXPIRY_URGENCY_WITHIN_DAYS', () => {
  it('EXP-03: 共有閾値は 3 日', () => {
    expect(EXPIRY_URGENCY_WITHIN_DAYS).toBe(3);
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

  it('EU-18: urgency と label が対応どおり連動する', () => {
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

// P-5 改（2026-08-10 確定）の回帰ガード。
//
// `TZ` は Vercel の予約環境変数で設定できないため、サーバの実行時 TZ は UTC のままになる。
// Cron は UTC 23:00（= JST 08:00）に発火するので、実行時 TZ に依存した実装だと「今日」が
// JST の前日と判定され、「本日まで」の在庫が「明日まで」として通知され、3 日間の窓も
// 1 日短くなる。以下は **その瞬間を再現する**ケースであり、実装が実行時 TZ に依存すると落ちる。
describe('JST 固定の期限判定（実行時 TZ に依存しない）', () => {
  // UTC では 2026-08-09 23:00 だが、JST では 2026-08-10 08:00。Cron の実際の発火時点。
  const cronFiredAt = new Date('2026-08-09T23:00:00.000Z');

  it('Cron 発火時点の「今日」を JST の暦日で判定する', () => {
    expect(toJstDateString(cronFiredAt)).toBe('2026-08-10');
  });

  it('JST で当日が期限の在庫を「本日まで」と扱う（UTC 基準だと「明日まで」になり誤る）', () => {
    expect(getExpiryRemainingDays('2026-08-10', cronFiredAt)).toBe(0);
    expect(formatExpiryUrgencyLabel(getExpiryRemainingDays('2026-08-10', cronFiredAt))).toBe(
      '本日まで',
    );
  });

  it('JST で前日が期限の在庫を期限切れと扱う', () => {
    expect(getExpiryRemainingDays('2026-08-09', cronFiredAt)).toBe(-1);
    expect(getExpiryUrgency(getExpiryRemainingDays('2026-08-09', cronFiredAt))).toBe('overdue');
  });

  it('3 日の窓が JST 基準で開く（閾値ちょうどの 08-13 を含み、08-14 を含まない）', () => {
    const stocks = [
      createStock({ id: 'in-boundary', expiresAt: '2026-08-13' }),
      createStock({ id: 'out-of-boundary', expiresAt: '2026-08-14' }),
    ];

    const selected = selectExpiringStocks(stocks, cronFiredAt, EXPIRY_URGENCY_WITHIN_DAYS);

    expect(selected.map((stock) => stock.id)).toStrictEqual(['in-boundary']);
  });

  it('JST 深夜（UTC では前日の昼）でも当日判定が JST の暦日に従う', () => {
    // UTC 2026-08-09 15:30 = JST 2026-08-10 00:30
    const justAfterJstMidnight = new Date('2026-08-09T15:30:00.000Z');

    expect(toJstDateString(justAfterJstMidnight)).toBe('2026-08-10');
    expect(getExpiryRemainingDays('2026-08-10', justAfterJstMidnight)).toBe(0);
  });
});
