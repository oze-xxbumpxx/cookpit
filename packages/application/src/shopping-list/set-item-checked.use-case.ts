import { ShoppingItemId } from '@cookpit/domain';
import type { UnitOfWork, ShoppingListRepository } from '@cookpit/domain';
import { findUpdatedItem, loadActiveShoppingList, requireItem } from './load-shopping-list';
import type { SetItemCheckedInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';

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
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: SetItemCheckedInputDto): Promise<ShoppingItemDto> {
    return this.unitOfWork.execute(async () => {
      const shoppingList = await loadActiveShoppingList(
        this.shoppingListRepository,
        input.shoppingListId,
        'setItemChecked',
      );

      const itemId = ShoppingItemId.fromString(input.itemId);
      const item = requireItem(shoppingList, itemId, input.itemId);

      const alreadyChecked = item.status === 'bought';
      if (input.checked && !alreadyChecked) {
        shoppingList.check(itemId);
      } else if (!input.checked && alreadyChecked) {
        shoppingList.uncheck(itemId);
      }

      await this.shoppingListRepository.save(shoppingList);
      return toShoppingItemDto(findUpdatedItem(shoppingList, itemId));
    });
  }
}
