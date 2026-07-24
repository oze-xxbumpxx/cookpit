import { normalizeUnit, type Unit } from './unit';

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

  add(other: Quantity): Quantity {
    // 単位は正規化して比較する（表記ゆれを同一視）。結果の単位は自身の原文を保持する。
    if (normalizeUnit(this.quantityUnit) !== normalizeUnit(other.quantityUnit)) {
      throw new Error('Cannot add different units');
    }
    return Quantity.of(this.quantityValue + other.quantityValue, this.quantityUnit);
  }

  /** @throws Error 単位が一致しない、または結果が負値になる場合（`Quantity.of` の検証に委ねる） */
  subtract(other: Quantity): Quantity {
    if (normalizeUnit(this.quantityUnit) !== normalizeUnit(other.quantityUnit)) {
      throw new Error('Cannot subtract different units');
    }
    return Quantity.of(this.quantityValue - other.quantityValue, this.quantityUnit);
  }

  get value(): number {
    return this.quantityValue;
  }
  get unit(): Unit {
    return this.quantityUnit;
  }
}
