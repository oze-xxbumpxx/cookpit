import { describe, expect, it } from 'vitest';
import type { Unit } from './unit';
import { isCountableUnit } from './unit';

describe('isCountableUnit', () => {
  const countable: Unit[] = ['個', '本', '枚', '玉', '尾', '切れ', '束', '袋', '缶'];
  const continuous: Unit[] = ['g', 'kg', 'ml', 'l', '大さじ', '小さじ', 'cup', '合'];

  it.each(countable)('数えられる単位 %s は true', (unit) => {
    expect(isCountableUnit(unit)).toBe(true);
  });

  it.each(continuous)('連続量 %s は false', (unit) => {
    expect(isCountableUnit(unit)).toBe(false);
  });
});
