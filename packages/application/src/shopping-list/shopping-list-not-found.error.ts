import { NotFoundError } from '../shared/errors';

export class ShoppingListNotFoundError extends NotFoundError {
  constructor(shoppingListId: string) {
    super('ShoppingList', shoppingListId);
  }
}
