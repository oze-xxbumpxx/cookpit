import { randomUUID } from 'node:crypto';

export class ShoppingItemId {
  private constructor(private readonly shoppingItemIdValue: string) {}

  static generate(): ShoppingItemId {
    return new ShoppingItemId(randomUUID());
  }

  static fromString(value: string): ShoppingItemId {
    return new ShoppingItemId(value);
  }

  equals(other: ShoppingItemId): boolean {
    return this.shoppingItemIdValue === other.shoppingItemIdValue;
  }

  get value(): string {
    return this.shoppingItemIdValue;
  }
}
