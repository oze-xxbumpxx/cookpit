import { describe, expect, it } from 'vitest';
import { Quantity } from './quantity';

describe('Quantity', () => {
  it('正の値で生成できる (Q1)', () => {
    const q = Quantity.of(100, 'g');
    expect(q.value).toBe(100);
    expect(q.unit).toBe('g');
  });

  it('負の値は拒否する (Q2)', () => {
    expect(() => Quantity.of(-1, 'g')).toThrow('Quantity must be non-negative');
  });

  it('0 は許容する (Q3)', () => {
    expect(Quantity.of(0, 'ml').value).toBe(0);
  });

  it('multiply で値をスケールし単位は不変 (Q4)', () => {
    const scaled = Quantity.of(100, 'g').multiply(2);
    expect(scaled.value).toBe(200);
    expect(scaled.unit).toBe('g');
  });

  it('multiply(0) は 0 になる (Q5)', () => {
    expect(Quantity.of(100, 'g').multiply(0).value).toBe(0);
  });
});
