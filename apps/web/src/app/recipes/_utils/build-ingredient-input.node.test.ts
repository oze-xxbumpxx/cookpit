import { describe, expect, it } from 'vitest';
import type { IngredientRowValue } from '@/app/recipes/_components/ingredient-row';
import { buildIngredientInput } from './build-ingredient-input';

function createRow(overrides: Partial<IngredientRowValue> = {}): IngredientRowValue {
  return {
    id: 'ingredient-0',
    displayName: '玉ねぎ',
    amountText: '2',
    amountUnit: '個',
    ...overrides,
  };
}

describe('buildIngredientInput', () => {
  it('BI-01: 全項目が空の行はスキップされ ingredients にも errors にも含まれない', () => {
    const result = buildIngredientInput([
      createRow({ displayName: '', amountText: '', amountUnit: '' }),
    ]);

    expect(result.ingredients).toEqual([]);
    expect(result.errors).toEqual({});
  });

  it('BI-02: 数値の量 + 単位ありは amountValue / amountUnit に入り amountNote は null', () => {
    const result = buildIngredientInput([createRow()]);

    expect(result.errors).toEqual({});
    expect(result.ingredients).toEqual([
      {
        productRef: null,
        displayName: '玉ねぎ',
        amountValue: 2,
        amountUnit: '個',
        amountNote: null,
      },
    ]);
  });

  it('BI-03: 非数値の量は amountNote に入り amountValue / amountUnit は null', () => {
    const result = buildIngredientInput([
      createRow({ displayName: '塩', amountText: '適量', amountUnit: '' }),
    ]);

    expect(result.errors).toEqual({});
    expect(result.ingredients).toEqual([
      {
        productRef: null,
        displayName: '塩',
        amountValue: null,
        amountUnit: null,
        amountNote: '適量',
      },
    ]);
  });

  it('BI-04: 食材名のみ空の行は行 ID キーでエラーになる', () => {
    const result = buildIngredientInput([createRow({ id: 'ingredient-3', displayName: '' })]);

    expect(result.ingredients).toEqual([]);
    expect(result.errors).toEqual({ 'ingredient-3': '食材名を入力してください。' });
  });

  it('BI-05: 量のみ空の行はエラーになる', () => {
    const result = buildIngredientInput([createRow({ amountText: '', amountUnit: '' })]);

    expect(result.ingredients).toEqual([]);
    expect(result.errors).toEqual({ 'ingredient-0': '量を入力してください。' });
  });

  it('BI-06: 負数の量はエラーになる', () => {
    const result = buildIngredientInput([createRow({ amountText: '-1' })]);

    expect(result.ingredients).toEqual([]);
    expect(result.errors).toEqual({ 'ingredient-0': '量は0以上の数値で入力してください。' });
  });

  it('BI-07: 数値の量で単位未選択はエラーになる', () => {
    const result = buildIngredientInput([createRow({ amountUnit: '' })]);

    expect(result.ingredients).toEqual([]);
    expect(result.errors).toEqual({ 'ingredient-0': '数値の量には単位を選択してください。' });
  });

  it('BI-08: 量 0 はエラーにならず、食材名・量の前後空白は trim される', () => {
    const result = buildIngredientInput([
      createRow({ displayName: ' 卵 ', amountText: ' 0 ', amountUnit: '個' }),
    ]);

    expect(result.errors).toEqual({});
    expect(result.ingredients).toEqual([
      {
        productRef: null,
        displayName: '卵',
        amountValue: 0,
        amountUnit: '個',
        amountNote: null,
      },
    ]);
  });

  it('BI-09: 有効行とエラー行が混在しても有効行は ingredients に残る', () => {
    const result = buildIngredientInput([
      createRow({ id: 'ingredient-0' }),
      createRow({ id: 'ingredient-1', displayName: '' }),
    ]);

    expect(result.ingredients).toHaveLength(1);
    expect(Object.keys(result.errors)).toEqual(['ingredient-1']);
  });
});
