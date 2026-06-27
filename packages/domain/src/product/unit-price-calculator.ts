import { Money } from '../shared/money';
import type { Quantity } from '../shared/quantity';

const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);

export class UnitPriceCalculator {
  static calculate(priceAmount: number, packageSize: Quantity): Money {
    if (packageSize.value <= 0) {
      throw new Error('Package size must be positive');
    }

    const unit = packageSize.unit;
    const value = packageSize.value;
    let unitPriceAmount: number;

    if (WEIGHT_UNITS.has(unit)) {
      const gramValue = unit === 'kg' ? value * 1000 : value;
      unitPriceAmount = (priceAmount / gramValue) * 100;
    } else if (VOLUME_UNITS.has(unit)) {
      const mlValue = unit === 'l' ? value * 1000 : value;
      unitPriceAmount = (priceAmount / mlValue) * 100;
    } else {
      unitPriceAmount = priceAmount / value;
    }

    const rounded = Math.round(unitPriceAmount * 10) / 10;
    return Money.of(rounded, 'JPY');
  }
}
