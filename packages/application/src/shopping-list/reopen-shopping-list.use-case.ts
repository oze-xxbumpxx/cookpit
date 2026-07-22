import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { ReopenShoppingListInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 完了済みの買い物リストを active に戻す（買い物を再開）。週の途中で買い足しがある運用向け。
 * 再開後は addItem / markAsBought 等が再び可能になり、再度 CompleteShopping を呼んでも
 * 既に在庫化済みの品目は二重処理されない（CompleteShopping の品目単位冪等ガード）。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 * @throws InvalidShoppingListStateError リストが completed 以外（既に active 等）
 */
export class ReopenShoppingListUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: ReopenShoppingListInputDto): Promise<ShoppingListDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'completed') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'reopen');
    }

    shoppingList.reopen();
    await this.shoppingListRepository.save(shoppingList);
    return toShoppingListDto(shoppingList);
  }
}
