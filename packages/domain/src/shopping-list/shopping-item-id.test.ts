import { describe, expect, it } from 'vitest';
import { ShoppingItemId } from './shopping-item-id';

describe('ShoppingItemId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const first = ShoppingItemId.generate();
    const second = ShoppingItemId.generate();

    expect(first.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.equals(second)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(ShoppingItemId.fromString('shopping-item-1').value).toBe('shopping-item-1');
  });

  it('equals は同じ値で true、異なる値で false を返す', () => {
    expect(
      ShoppingItemId.fromString('shopping-item-1').equals(
        ShoppingItemId.fromString('shopping-item-1'),
      ),
    ).toBe(true);
    expect(
      ShoppingItemId.fromString('shopping-item-1').equals(
        ShoppingItemId.fromString('shopping-item-2'),
      ),
    ).toBe(false);
  });
});
