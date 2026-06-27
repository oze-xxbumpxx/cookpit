import { randomUUID } from 'node:crypto';

export class PriceRecordId {
  private constructor(private readonly priceRecordIdValue: string) {}

  static generate(): PriceRecordId {
    return new PriceRecordId(randomUUID());
  }

  static fromString(value: string): PriceRecordId {
    return new PriceRecordId(value);
  }

  equals(other: PriceRecordId): boolean {
    return this.priceRecordIdValue === other.priceRecordIdValue;
  }

  get value(): string {
    return this.priceRecordIdValue;
  }
}
