import { Money, ShoppingItemId, ShoppingListId, StoreId } from '@cookpit/domain';
import type { ShoppingListRepository } from '@cookpit/domain';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { MarkAsBoughtInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

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
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'markAsBought');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    const itemExists = shoppingList.items.some((item) => item.id.equals(itemId));
    if (!itemExists) {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    shoppingList.markAsBought(
      itemId,
      Money.of(input.actualPrice.amount, input.actualPrice.currency),
      StoreId.fromString(input.actualStoreId),
    );

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((item) => item.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
