import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@cookpit/domain';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import { ReassignStoreUseCase } from './reassign-store.use-case';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';
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

describe('ReassignStoreUseCase', () => {
  const input = {
    shoppingListId: SHOPPING_LIST_ID,
    itemId: SHOPPING_ITEM_ID,
    targetStoreId: 'new-store',
  };

  it('購入予定店舗を変更する', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new ReassignStoreUseCase(shoppingListRepository).execute(input);

    expect(dto.targetStoreId).toBe('new-store');
  });

  it('bought の購入実績を保持したまま targetStoreId だけ変更する', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(100, 'JPY'),
          actualStoreId: 'actual-store',
        }),
      ]),
    );

    const dto = await new ReassignStoreUseCase(shoppingListRepository).execute(input);

    expect(dto.targetStoreId).toBe('new-store');
    expect(dto.actualPrice).toEqual({ amount: 100, currency: 'JPY' });
    expect(dto.actualStoreId).toBe('actual-store');
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });
});
