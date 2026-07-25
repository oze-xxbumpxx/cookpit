import { ShoppingItemId, StoreId } from '@cookpit/domain';
import type { ShoppingListRepository } from '@cookpit/domain';
import { findUpdatedItem, loadActiveShoppingList, requireItem } from './load-shopping-list';
import type { ReassignStoreInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';

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
    const shoppingList = await loadActiveShoppingList(
      this.shoppingListRepository,
      input.shoppingListId,
      'reassignStore',
    );

    const itemId = ShoppingItemId.fromString(input.itemId);
    requireItem(shoppingList, itemId, input.itemId);

    shoppingList.reassignStore(itemId, StoreId.fromString(input.targetStoreId));

    await this.shoppingListRepository.save(shoppingList);
    return toShoppingItemDto(findUpdatedItem(shoppingList, itemId));
  }
}
