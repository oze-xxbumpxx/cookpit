import { describe, expect, it } from 'vitest';
import { StockId } from './stock-id';

describe('StockId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const first = StockId.generate();
    const second = StockId.generate();

    expect(first.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.equals(second)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(StockId.fromString('stock-1').value).toBe('stock-1');
  });

  it('equals は同じ値に true を返す', () => {
    expect(StockId.fromString('stock-1').equals(StockId.fromString('stock-1'))).toBe(true);
  });

  it('equals は異なる値に false を返す', () => {
    expect(StockId.fromString('stock-1').equals(StockId.fromString('stock-2'))).toBe(false);
  });
});
