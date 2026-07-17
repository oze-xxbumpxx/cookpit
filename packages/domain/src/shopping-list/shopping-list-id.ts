import { Identifier, generateId } from '../shared/identifier';

export class ShoppingListId extends Identifier<'ShoppingListId'> {
  static generate(): ShoppingListId {
    return new ShoppingListId(generateId());
  }

  static fromString(value: string): ShoppingListId {
    return new ShoppingListId(value);
  }
}
