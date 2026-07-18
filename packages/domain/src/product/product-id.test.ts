import { describe, expect, it } from 'vitest';
import { ProductId } from './product-id';

describe('ProductId', () => {
  it('generate は毎回異なる UUID を生成する (PID1)', () => {
    const a = ProductId.generate();
    const b = ProductId.generate();
    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する (PID2)', () => {
    expect(ProductId.fromString('product-1').value).toBe('product-1');
  });

  it('同じ値どうしは equals が true (PID3)', () => {
    expect(ProductId.fromString('product-1').equals(ProductId.fromString('product-1'))).toBe(true);
  });

  it('異なる値どうしは equals が false (PID4)', () => {
    expect(ProductId.fromString('product-1').equals(ProductId.fromString('product-2'))).toBe(false);
  });
});
