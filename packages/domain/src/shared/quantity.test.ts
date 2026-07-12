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

  it('multiply に負のファクターを渡すと非負制約でスロー (Q-GAP-1)', () => {
    expect(() => Quantity.of(100, 'g').multiply(-1)).toThrow('Quantity must be non-negative');
  });

  it('add で同じ単位の値を加算する', () => {
    const result = Quantity.of(100, 'g').add(Quantity.of(200, 'g'));

    expect(result.value).toBe(300);
    expect(result.unit).toBe('g');
  });

  it('add で異なる単位は拒否する', () => {
    expect(() => Quantity.of(100, 'g').add(Quantity.of(200, 'ml'))).toThrow(
      'Cannot add different units',
    );
  });

  it('add で 0 と加算すると元の値になる', () => {
    const result = Quantity.of(0, 'g').add(Quantity.of(200, 'g'));

    expect(result.value).toBe(200);
    expect(result.unit).toBe('g');
  });
});
