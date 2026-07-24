import { describe, expect, it } from 'vitest';
import { parseQuantity } from './parse-quantity';

describe('parseQuantity', () => {
  it('PQ-01: 数値+単位を value/unit に分解する', () => {
    expect(parseQuantity('3個')).toEqual({ kind: 'amount', value: 3, unit: '個' });
    expect(parseQuantity('300g')).toEqual({ kind: 'amount', value: 300, unit: 'g' });
    expect(parseQuantity('1.5本')).toEqual({ kind: 'amount', value: 1.5, unit: '本' });
  });

  it('PQ-02: 数値と単位の間の空白を許容する', () => {
    expect(parseQuantity('3 個')).toEqual({ kind: 'amount', value: 3, unit: '個' });
    expect(parseQuantity('  300  g  ')).toEqual({ kind: 'amount', value: 300, unit: 'g' });
  });

  it('PQ-03: 分数は小数に変換する', () => {
    expect(parseQuantity('1/2袋')).toEqual({ kind: 'amount', value: 0.5, unit: '袋' });
    expect(parseQuantity('3/4cup')).toEqual({ kind: 'amount', value: 0.75, unit: 'cup' });
  });

  it('PQ-04: 全角数字・全角単位を NFKC 正規化して分解する', () => {
    expect(parseQuantity('３個')).toEqual({ kind: 'amount', value: 3, unit: '個' });
    expect(parseQuantity('３００ｇ')).toEqual({ kind: 'amount', value: 300, unit: 'g' });
  });

  it('PQ-05: 数値のみ（単位なし）は valueOnly', () => {
    expect(parseQuantity('3')).toEqual({ kind: 'valueOnly', value: 3 });
    expect(parseQuantity('2.5')).toEqual({ kind: 'valueOnly', value: 2.5 });
  });

  it('PQ-06: 数値で始まらない自由記述は note', () => {
    expect(parseQuantity('少々')).toEqual({ kind: 'note', note: '少々' });
    expect(parseQuantity('大さじ2')).toEqual({ kind: 'note', note: '大さじ2' });
    expect(parseQuantity('適量')).toEqual({ kind: 'note', note: '適量' });
  });

  it('PQ-07: 負の数値は note として扱う', () => {
    expect(parseQuantity('-1個')).toEqual({ kind: 'note', note: '-1個' });
  });

  it('PQ-08: 空文字・空白のみは empty', () => {
    expect(parseQuantity('')).toEqual({ kind: 'empty' });
    expect(parseQuantity('   ')).toEqual({ kind: 'empty' });
  });

  it('PQ-09: 0 は有効な数値として扱う', () => {
    expect(parseQuantity('0個')).toEqual({ kind: 'amount', value: 0, unit: '個' });
  });
});
