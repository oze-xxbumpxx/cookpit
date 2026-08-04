import { ShoppingItemId } from '@cookpit/domain';
import type { ShoppingListRepository } from '@cookpit/domain';
import { loadActiveShoppingList, requireItem } from './load-shopping-list';
import type { RemoveItemInputDto } from './shopping-list.dto';

/**
 * 買い物リストから品目を取り除く（物理削除。ADR-0011）。誤って追加した品目を消すための操作で、
 * status / source を問わず削除できる。bought の品目を削除すると購入実績も一緒に失われる。
 *
 * 冪等ではない: 削除済みの itemId を再度指定すると `ShoppingItemNotFoundError` になる。
 * 呼び出し側（画面）は 404 を成功として扱い、利用者から見た操作を冪等にしている。
 *
 * 献立由来（source: from_meal_plan）の品目も削除できるが、以後に献立同期
 * （`SyncShoppingListFromMealPlanUseCase`）を実行すると再び追加される（ADR-0007 の差分マージは
 * 「既存に無い材料を追加する」ため、削除を記憶しない）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export class RemoveItemUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: RemoveItemInputDto): Promise<void> {
    const shoppingList = await loadActiveShoppingList(
      this.shoppingListRepository,
      input.shoppingListId,
      'removeItem',
    );

    const itemId = ShoppingItemId.fromString(input.itemId);
    requireItem(shoppingList, itemId, input.itemId);

    shoppingList.removeItem(itemId);

    await this.shoppingListRepository.save(shoppingList);
  }
}
