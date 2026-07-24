import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { SetItemCheckedInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 品目のチェック状態（購入予定に印を付ける／外す）を明示的にセットする。価格・店舗の記録は
 * 行わない（`MarkAsBoughtUseCase` が別途担当）。
 *
 * 冪等: input.checked が現在の状態と既に一致する場合は Domain のメソッド呼び出し自体を
 * スキップする（`uncheck()` は status !== 'bought' で例外を投げるため、2人が同時に操作しても
 * 例外にならないようにするための Application 層のガード。D-7 の「2人利用」を踏まえた設計）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export class SetItemCheckedUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: SetItemCheckedInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'setItemChecked');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    const item = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (item === undefined) {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    const alreadyChecked = item.status === 'bought';
    if (input.checked && !alreadyChecked) {
      shoppingList.check(itemId);
    } else if (!input.checked && alreadyChecked) {
      shoppingList.uncheck(itemId);
    }

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
