import { ShoppingItemId, ShoppingListId, StoreId } from '@cookpit/domain';
import type { ShoppingListRepository } from '@cookpit/domain';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { ReassignStoreInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 品目の購入予定店舗を変更する。確定済みの購入実績（actualPrice / actualStoreId）には
 * 影響しない（S-11c）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
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
    const itemExists = shoppingList.items.some((item) => item.id.equals(itemId));
    if (!itemExists) {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    shoppingList.reassignStore(itemId, StoreId.fromString(input.targetStoreId));

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((item) => item.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
