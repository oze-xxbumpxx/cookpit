import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import type { GetShoppingListInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 買い物リスト 1 件を取得する（状態を問わず completed も取得できる）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 */
export class GetShoppingListUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: GetShoppingListInputDto): Promise<ShoppingListDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    return toShoppingListDto(shoppingList);
  }
}
