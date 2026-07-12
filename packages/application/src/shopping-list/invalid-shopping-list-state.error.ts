import type { ShoppingListStatus } from './shopping-list.dto';

export class InvalidShoppingListStateError extends Error {
  constructor(current: ShoppingListStatus, operation: string) {
    super(`Cannot ${operation} a ShoppingList with status '${current}'`);
    this.name = 'InvalidShoppingListStateError';
  }
}
