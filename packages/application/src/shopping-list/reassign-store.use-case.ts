import { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { ReassignStoreInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

export class ReassignStoreUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: ReassignStoreInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'reassignStore');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    try {
      shoppingList.reassignStore(itemId, StoreId.fromString(input.targetStoreId));
    } catch {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((item) => item.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
