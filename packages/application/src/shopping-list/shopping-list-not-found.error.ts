export class ShoppingListNotFoundError extends Error {
  constructor(shoppingListId: string) {
    super(`ShoppingList not found: ${shoppingListId}`);
    this.name = 'ShoppingListNotFoundError';
  }
}
