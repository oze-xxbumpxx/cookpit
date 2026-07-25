import { Money, ShoppingItemId, StoreId } from '@cookpit/domain';
import type { ShoppingListRepository } from '@cookpit/domain';
import { findUpdatedItem, loadActiveShoppingList, requireItem } from './load-shopping-list';
import type { MarkAsBoughtInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';

/**
 * 品目を購入済みにし、実売価格と購入店舗を記録する。bought への再適用・skipped からの
 * 購入確定は最新の実績で上書きする（S-11a/S-11b）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export class MarkAsBoughtUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: MarkAsBoughtInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await loadActiveShoppingList(
      this.shoppingListRepository,
      input.shoppingListId,
      'markAsBought',
    );

    const itemId = ShoppingItemId.fromString(input.itemId);
    requireItem(shoppingList, itemId, input.itemId);

    shoppingList.markAsBought(
      itemId,
      Money.of(input.actualPrice.amount, input.actualPrice.currency),
      StoreId.fromString(input.actualStoreId),
    );

    await this.shoppingListRepository.save(shoppingList);
    return toShoppingItemDto(findUpdatedItem(shoppingList, itemId));
  }
}
