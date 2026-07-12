import { randomUUID } from 'node:crypto';

export class ShoppingListId {
  private constructor(private readonly shoppingListIdValue: string) {}

  static generate(): ShoppingListId {
    return new ShoppingListId(randomUUID());
  }

  static fromString(value: string): ShoppingListId {
    return new ShoppingListId(value);
  }

  equals(other: ShoppingListId): boolean {
    return this.shoppingListIdValue === other.shoppingListIdValue;
  }

  get value(): string {
    return this.shoppingListIdValue;
  }
}
