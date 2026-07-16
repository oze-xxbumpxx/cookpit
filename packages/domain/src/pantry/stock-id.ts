import { randomUUID } from 'node:crypto';

export class StockId {
  private constructor(private readonly stockIdValue: string) {}

  static generate(): StockId {
    return new StockId(randomUUID());
  }

  static fromString(value: string): StockId {
    return new StockId(value);
  }

  equals(other: StockId): boolean {
    return this.stockIdValue === other.stockIdValue;
  }

  get value(): string {
    return this.stockIdValue;
  }
}
