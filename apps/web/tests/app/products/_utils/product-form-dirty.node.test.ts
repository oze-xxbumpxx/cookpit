import { describe, expect, it } from 'vitest';
import {
  createInitialProductFormValue,
  type ProductFormValue,
} from '../../../../src/app/products/_components/product-form-fields';
import { isProductFormDirty } from '../../../../src/app/products/_utils/product-form-dirty';

function createValue(overrides: Partial<ProductFormValue> = {}): ProductFormValue {
  return {
    ...createInitialProductFormValue(),
    name: '玉ねぎ',
    aliasesText: '玉葱, タマネギ',
    category: '野菜',
    defaultUnit: '個',
    ...overrides,
  };
}

const INITIAL = createValue();

describe('isProductFormDirty', () => {
  it('PFD-01: 初期値と同一なら false', () => {
    expect(isProductFormDirty(INITIAL, createValue())).toBe(false);
  });

  it('PFD-02: name の変更を検出する', () => {
    expect(isProductFormDirty(INITIAL, createValue({ name: '人参' }))).toBe(true);
  });

  it('PFD-03: 別名の内容変更を検出する', () => {
    expect(isProductFormDirty(INITIAL, createValue({ aliasesText: 'タマネギ' }))).toBe(true);
  });

  it('PFD-04: 別名の並び順の差を変更と見なす', () => {
    expect(isProductFormDirty(INITIAL, createValue({ aliasesText: 'タマネギ, 玉葱' }))).toBe(true);
  });

  it('PFD-05: カテゴリ / 単位の変更を検出する', () => {
    expect(isProductFormDirty(INITIAL, createValue({ category: '肉' }))).toBe(true);
    expect(isProductFormDirty(INITIAL, createValue({ defaultUnit: 'g' }))).toBe(true);
  });

  it('PFD-06: 空白・余分なカンマだけの差は変更と見なさない', () => {
    expect(isProductFormDirty(INITIAL, createValue({ name: ' 玉ねぎ ' }))).toBe(false);
    expect(isProductFormDirty(INITIAL, createValue({ aliasesText: '玉葱,タマネギ' }))).toBe(false);
    expect(isProductFormDirty(INITIAL, createValue({ aliasesText: '玉葱, タマネギ, , ' }))).toBe(
      false,
    );
    expect(
      isProductFormDirty(createValue({ aliasesText: '' }), createValue({ aliasesText: ', ,' })),
    ).toBe(false);
  });

  it('PFD-07: 変更して元に戻すと false に戻る', () => {
    expect(isProductFormDirty(INITIAL, createValue({ name: '人参' }))).toBe(true);
    expect(isProductFormDirty(INITIAL, createValue({ name: '玉ねぎ' }))).toBe(false);
  });
});
