import { randomUUID } from 'node:crypto';

export class ProductId {
  private constructor(private readonly productIdValue: string) {}

  static generate(): ProductId {
    return new ProductId(randomUUID());
  }

  static fromString(value: string): ProductId {
    return new ProductId(value);
  }

  equals(other: ProductId): boolean {
    return this.productIdValue === other.productIdValue;
  }

  get value(): string {
    return this.productIdValue;
  }
}
