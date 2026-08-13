import { ProductId, Quantity, ShoppingItem, ShoppingListId, StoreId } from '@cookpit/domain';
import type { UnitOfWork, ShoppingListRepository } from '@cookpit/domain';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';
import type { AddItemInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';

/**
 * active な買い物リストへ手動品目（source: 'manually_added'）を追加する。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 */
export class AddItemUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: AddItemInputDto): Promise<ShoppingItemDto> {
    return this.unitOfWork.execute(async () => {
      const shoppingList = await this.shoppingListRepository.findById(
        ShoppingListId.fromString(input.shoppingListId),
      );
      if (shoppingList === null) {
        throw new ShoppingListNotFoundError(input.shoppingListId);
      }
      if (shoppingList.status !== 'active') {
        throw new InvalidShoppingListStateError(shoppingList.status, 'addItem');
      }

      const item = ShoppingItem.create({
        productId: input.productId ? ProductId.fromString(input.productId) : null,
        displayName: input.displayName,
        requiredAmount: Quantity.of(input.requiredAmount.value, input.requiredAmount.unit),
        amountNote: null,
        targetStore: input.targetStoreId ? StoreId.fromString(input.targetStoreId) : null,
        source: 'manually_added',
      });

      shoppingList.addItem(item);
      await this.shoppingListRepository.save(shoppingList);
      return toShoppingItemDto(item);
    });
  }
}
