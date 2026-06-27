import { describe, expect, it } from 'vitest';
import { Quantity } from '../shared/quantity';
import { UnitPriceCalculator } from './unit-price-calculator';

describe('UnitPriceCalculator', () => {
  it('g は 100g あたりの単価を返す (UPC1)', () => {
    const unitPrice = UnitPriceCalculator.calculate(137, Quantity.of(300, 'g'));
    expect(unitPrice.amount).toBe(45.7);
    expect(unitPrice.currency).toBe('JPY');
  });

  it('kg は g に変換して 100g あたりの単価を返す (UPC2)', () => {
    expect(UnitPriceCalculator.calculate(300, Quantity.of(1, 'kg')).amount).toBe(30);
  });

  it('ml は 100ml あたりの単価を返す (UPC3)', () => {
    expect(UnitPriceCalculator.calculate(250, Quantity.of(500, 'ml')).amount).toBe(50);
  });

  it('l は ml に変換して 100ml あたりの単価を返す (UPC4)', () => {
    expect(UnitPriceCalculator.calculate(180, Quantity.of(2, 'l')).amount).toBe(9);
  });

  it('個数系は 1単位あたりの単価を返す (UPC5)', () => {
    expect(UnitPriceCalculator.calculate(300, Quantity.of(3, '個')).amount).toBe(100);
  });

  it('調理単位は 1単位あたりの単価を返す (UPC6)', () => {
    expect(UnitPriceCalculator.calculate(120, Quantity.of(2, '大さじ')).amount).toBe(60);
  });

  it('packageSize が 0 なら拒否する (UPC7)', () => {
    expect(() => UnitPriceCalculator.calculate(120, Quantity.of(0, 'g'))).toThrow(
      'Package size must be positive',
    );
  });
});
