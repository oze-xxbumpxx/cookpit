import { describe, expect, it } from 'vitest';
import { PantryId } from '../../src/pantry/pantry-id';

describe('PantryId', () => {
  it('singleton は常に同じ固定値を返す', () => {
    const first = PantryId.singleton();
    const second = PantryId.singleton();

    expect(first.value).toBe('00000000-0000-0000-0000-000000000000');
    expect(second.value).toBe(first.value);
    expect(first.equals(second)).toBe(true);
  });

  it('fromString は値を保持する', () => {
    expect(PantryId.fromString('pantry-1').value).toBe('pantry-1');
  });
});
