export class ShoppingItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`ShoppingItem not found: ${itemId}`);
    this.name = 'ShoppingItemNotFoundError';
  }
}
