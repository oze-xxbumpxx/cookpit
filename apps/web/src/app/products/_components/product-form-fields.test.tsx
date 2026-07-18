import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProductFormFields,
  buildProductFormBody,
  createInitialProductFormValue,
  emptyProductFieldErrors,
  toProductCategory,
  toProductUnit,
  type ProductFormValue,
} from './product-form-fields';

function createValue(overrides: Partial<ProductFormValue> = {}): ProductFormValue {
  return {
    ...createInitialProductFormValue(),
    ...overrides,
  };
}

describe('buildProductFormBody', () => {
  it('PFF-01: name は trim され、aliases はカンマ分割・trim・空要素除去される', () => {
    const result = buildProductFormBody(
      createValue({ name: ' 玉ねぎ ', aliasesText: '玉葱, タマネギ, , ' }),
    );

    expect(result.errors.name).toBeNull();
    expect(result.input).toEqual({
      name: '玉ねぎ',
      aliases: ['玉葱', 'タマネギ'],
      category: createInitialProductFormValue().category,
      defaultUnit: createInitialProductFormValue().defaultUnit,
    });
  });

  it('PFF-02: name が空のときエラーになり input は null', () => {
    const result = buildProductFormBody(createValue({ name: '   ' }));

    expect(result.input).toBeNull();
    expect(result.errors.name).toBe('商品名を入力してください。');
  });
});

describe('toProductCategory / toProductUnit', () => {
  it('PFF-03: 不明な値はフォールバックされる（その他 / 個）', () => {
    expect(toProductCategory('野菜')).toBe('野菜');
    expect(toProductCategory('unknown')).toBe('その他');
    expect(toProductUnit('g')).toBe('g');
    expect(toProductUnit('unknown')).toBe('個');
  });
});

describe('ProductFormFields', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PFF-04: 入力変更が onChange に反映され、name エラーが表示される', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProductFormFields
        value={createValue()}
        fieldErrors={{ name: '商品名を入力してください。' }}
        onChange={onChange}
      />,
    );

    // 状態を持たない controlled render のため 1 文字入力で onChange を検証する
    await user.type(screen.getByLabelText(/商品名/), '卵');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ name: '卵' }));

    await user.type(screen.getByLabelText(/別名/), 'エ');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ aliasesText: 'エ' }));

    expect(screen.getByText('商品名を入力してください。')).toBeDefined();
  });
});
