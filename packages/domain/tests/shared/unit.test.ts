import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/shared/unit';
import { isCountableUnit, normalizeUnit } from '../../src/shared/unit';

describe('isCountableUnit', () => {
  const countable: Unit[] = ['個', '本', '枚', '玉', '尾', '切れ', '束', '袋', '缶'];
  const continuous: Unit[] = ['g', 'kg', 'ml', 'l', '大さじ', '小さじ', 'cup', '合'];

  it.each(countable)('数えられる単位 %s は true', (unit) => {
    expect(isCountableUnit(unit)).toBe(true);
  });

  it.each(continuous)('連続量 %s は false', (unit) => {
    expect(isCountableUnit(unit)).toBe(false);
  });

  it('前後空白・全角の可算単位も正規化して true（項目3）', () => {
    expect(isCountableUnit(' 個 ')).toBe(true);
    expect(isCountableUnit('個')).toBe(true);
  });

  it('プリセット外の自由入力単位は非可算（false・切り上げしない）', () => {
    expect(isCountableUnit('ダース')).toBe(false);
    expect(isCountableUnit('房')).toBe(false);
  });
});

describe('normalizeUnit', () => {
  it('前後空白を除去する', () => {
    expect(normalizeUnit('  個  ')).toBe('個');
  });

  it('NFKC 正規化で全角英字を半角へ揃える', () => {
    expect(normalizeUnit('ｍｌ')).toBe('ml');
  });
});
