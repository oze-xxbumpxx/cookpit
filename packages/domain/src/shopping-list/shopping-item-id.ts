import { Identifier, generateId } from '../shared/identifier';

export class ShoppingItemId extends Identifier {
  static generate(): ShoppingItemId {
    return new ShoppingItemId(generateId());
  }

  static fromString(value: string): ShoppingItemId {
    return new ShoppingItemId(value);
  }
}
