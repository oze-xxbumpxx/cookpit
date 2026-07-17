import { InvalidStateError } from '../shared/errors';
import type { ShoppingListStatus } from './shopping-list.dto';

export class InvalidShoppingListStateError extends InvalidStateError {
  constructor(current: ShoppingListStatus, operation: string) {
    super('ShoppingList', current, operation);
  }
}
