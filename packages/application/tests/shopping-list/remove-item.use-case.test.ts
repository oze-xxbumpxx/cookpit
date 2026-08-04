import { beforeEach, describe, expect, it } from 'vitest';
import { Money, ShoppingListId } from '@cookpit/domain';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { RemoveItemUseCase } from '../../src/shopping-list/remove-item.use-case';
import { ShoppingItemNotFoundError } from '../../src/shopping-list/shopping-item-not-found.error';
import { ShoppingListNotFoundError } from '../../src/shopping-list/shopping-list-not-found.error';
import {
  SHOPPING_LIST_ID,
  SHOPPING_ITEM_ID,
  seededItem,
  seededShoppingList,
  createRepositories,
} from './test-helpers';
import type { InMemoryShoppingListRepository } from './test-helpers';

let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  ({ shoppingListRepository } = createRepositories());
});

async function savedItemIds(): Promise<string[]> {
  const saved = await shoppingListRepository.findById(ShoppingListId.fromString(SHOPPING_LIST_ID));
  return (saved?.items ?? []).map((item) => item.id.value);
}

describe('RemoveItemUseCase', () => {
  const input = { shoppingListId: SHOPPING_LIST_ID, itemId: SHOPPING_ITEM_ID };

  it('品目を取り除いて保存する', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [seededItem(), seededItem({ id: 'shopping-item-2' })]),
    );

    await new RemoveItemUseCase(shoppingListRepository).execute(input);

    expect(shoppingListRepository.saveCount).toBe(1);
    expect(await savedItemIds()).toEqual(['shopping-item-2']);
  });

  it('戻り値を持たない', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const result = await new RemoveItemUseCase(shoppingListRepository).execute(input);

    expect(result).toBeUndefined();
  });

  it('bought の品目も購入実績ごと取り除く', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(198, 'JPY'),
          actualStoreId: 'actual-store',
        }),
      ]),
    );

    await new RemoveItemUseCase(shoppingListRepository).execute(input);

    expect(await savedItemIds()).toEqual([]);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new RemoveItemUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new RemoveItemUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new RemoveItemUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  // 検査順は loadActiveShoppingList が固定している「存在 → 状態」に従う。completed かつ
  // 不在 itemId では状態エラー（422）が品目エラー（404）より優先される。
  it('completed かつ存在しない itemId では状態エラーを優先する', async () => {
    shoppingListRepository.seed(seededShoppingList('completed', []));

    await expect(
      new RemoveItemUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });

  it('削除済みの itemId を再指定すると ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList());
    const usecase = new RemoveItemUseCase(shoppingListRepository);
    await usecase.execute(input);

    await expect(usecase.execute(input)).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });
});
