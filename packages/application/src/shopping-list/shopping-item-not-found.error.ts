import { NotFoundError } from '../shared/errors';

export class ShoppingItemNotFoundError extends NotFoundError {
  constructor(itemId: string) {
    super('ShoppingItem', itemId);
  }
}
