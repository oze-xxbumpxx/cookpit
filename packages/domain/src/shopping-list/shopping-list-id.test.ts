import { describe, expect, it } from 'vitest';
import { ShoppingListId } from './shopping-list-id';

describe('ShoppingListId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const first = ShoppingListId.generate();
    const second = ShoppingListId.generate();

    expect(first.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.equals(second)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(ShoppingListId.fromString('shopping-list-1').value).toBe('shopping-list-1');
  });

  it('equals は同じ値で true、異なる値で false を返す', () => {
    expect(
      ShoppingListId.fromString('shopping-list-1').equals(
        ShoppingListId.fromString('shopping-list-1'),
      ),
    ).toBe(true);
    expect(
      ShoppingListId.fromString('shopping-list-1').equals(
        ShoppingListId.fromString('shopping-list-2'),
      ),
    ).toBe(false);
  });
});
