import type { Unit } from './unit';

export class Quantity {
  private constructor(
    private readonly quantityValue: number,
    private readonly quantityUnit: Unit,
  ) {}

  static of(value: number, unit: Unit): Quantity {
    if (value < 0) {
      throw new Error('Quantity must be non-negative');
    }
    return new Quantity(value, unit);
  }

  multiply(factor: number): Quantity {
    return Quantity.of(this.quantityValue * factor, this.quantityUnit);
  }

  get value(): number {
    return this.quantityValue;
  }
  get unit(): Unit {
    return this.quantityUnit;
  }
}
