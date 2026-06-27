import { describe, expect, it } from 'vitest';
import { Money } from './money';

describe('Money', () => {
  it('正の金額で生成できる (M1)', () => {
    const money = Money.of(100, 'JPY');
    expect(money.amount).toBe(100);
    expect(money.currency).toBe('JPY');
  });

  it('0 は許容する (M2)', () => {
    expect(Money.of(0, 'JPY').amount).toBe(0);
  });

  it('負の金額は拒否する (M3)', () => {
    expect(() => Money.of(-1, 'JPY')).toThrow('Money amount must be non-negative');
  });

  it('add で同じ通貨を加算できる (M4)', () => {
    const total = Money.of(100, 'JPY').add(Money.of(50, 'JPY'));
    expect(total.amount).toBe(150);
    expect(total.currency).toBe('JPY');
  });

  it('add は異なる通貨を拒否する (M5)', () => {
    expect(() => Money.of(100, 'JPY').add(Money.of(1, 'USD'))).toThrow(
      'Cannot add different currencies',
    );
  });

  it('multiply で金額をスケールする (M6)', () => {
    const multiplied = Money.of(120, 'JPY').multiply(2.5);
    expect(multiplied.amount).toBe(300);
    expect(multiplied.currency).toBe('JPY');
  });

  it('multiply に負のファクターを渡すと非負制約でスロー (M-GAP-1)', () => {
    expect(() => Money.of(100, 'JPY').multiply(-1)).toThrow('Money amount must be non-negative');
  });

  it('multiply(0) は 0 円になる (M-GAP-2)', () => {
    expect(Money.of(100, 'JPY').multiply(0).amount).toBe(0);
  });

  it('isLessThan は大小比較を返す (M7)', () => {
    expect(Money.of(99, 'JPY').isLessThan(Money.of(100, 'JPY'))).toBe(true);
    expect(Money.of(100, 'JPY').isLessThan(Money.of(99, 'JPY'))).toBe(false);
  });

  it('isLessThan — 同値は false を返す (M-GAP-3)', () => {
    expect(Money.of(100, 'JPY').isLessThan(Money.of(100, 'JPY'))).toBe(false);
  });

  it('isLessThan は異なる通貨を拒否する (M8)', () => {
    expect(() => Money.of(100, 'JPY').isLessThan(Money.of(1, 'USD'))).toThrow(
      'Cannot compare different currencies',
    );
  });
});
