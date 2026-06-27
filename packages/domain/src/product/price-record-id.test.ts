import { describe, expect, it } from 'vitest';
import { PriceRecordId } from './price-record-id';

describe('PriceRecordId', () => {
  it('generate は毎回異なる UUID を生成する (PRID1)', () => {
    const a = PriceRecordId.generate();
    const b = PriceRecordId.generate();
    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する (PRID2)', () => {
    expect(PriceRecordId.fromString('price-record-1').value).toBe('price-record-1');
  });

  it('同じ値どうしは equals が true (PRID3)', () => {
    expect(
      PriceRecordId.fromString('price-record-1').equals(
        PriceRecordId.fromString('price-record-1'),
      ),
    ).toBe(true);
  });

  it('異なる値どうしは equals が false (PRID4)', () => {
    expect(
      PriceRecordId.fromString('price-record-1').equals(
        PriceRecordId.fromString('price-record-2'),
      ),
    ).toBe(false);
  });
});
