import { ShoppingListId } from '@cookpit/domain';
import type {
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListRepository,
} from '@cookpit/domain';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 品目を操作する UseCase（markAsBought / setItemChecked / reassignStore）の共通の入口。
 * 買い物リストを取得し、操作可能な状態であることを検査する。
 *
 * 検査順は「存在 → 状態」で固定する。completed のリストに対して存在しない品目 ID を
 * 指定した場合は状態エラー（422）が優先される。
 *
 * @param operation `InvalidShoppingListStateError` のメッセージに載る操作名
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 */
export async function loadActiveShoppingList(
  repository: ShoppingListRepository,
  shoppingListId: string,
  operation: string,
): Promise<ShoppingList> {
  const shoppingList = await repository.findById(ShoppingListId.fromString(shoppingListId));
  if (shoppingList === null) {
    throw new ShoppingListNotFoundError(shoppingListId);
  }
  if (shoppingList.status !== 'active') {
    throw new InvalidShoppingListStateError(shoppingList.status, operation);
  }
  return shoppingList;
}

/**
 * 操作対象の品目を取得する。
 *
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export function requireItem(
  shoppingList: ShoppingList,
  itemId: ShoppingItemId,
  rawItemId: string,
): ShoppingItem {
  const item = shoppingList.items.find((candidate) => candidate.id.equals(itemId)) ?? null;
  if (item === null) {
    throw new ShoppingItemNotFoundError(rawItemId);
  }
  return item;
}

/**
 * 保存後の品目を取り直す。DTO へ変換する前に、操作で差し替わった最新のインスタンスを得るための
 * もの。ここで見つからないのは呼び出し側のバグであり、利用者起因のエラーではないため
 * `ShoppingItemNotFoundError` ではなく素の `Error` を投げる。
 */
export function findUpdatedItem(shoppingList: ShoppingList, itemId: ShoppingItemId): ShoppingItem {
  const updated = shoppingList.items.find((candidate) => candidate.id.equals(itemId)) ?? null;
  if (updated === null) {
    throw new Error('Updated ShoppingItem not found');
  }
  return updated;
}
