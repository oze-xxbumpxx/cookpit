import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@cookpit/domain';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { MarkAsBoughtUseCase } from '../../src/shopping-list/mark-as-bought.use-case';
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
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  ({ shoppingListRepository } = createRepositories());
});

describe('MarkAsBoughtUseCase', () => {
  const input = {
    shoppingListId: SHOPPING_LIST_ID,
    itemId: SHOPPING_ITEM_ID,
    actualPrice: { amount: 180, currency: 'JPY' },
    actualStoreId: 'actual-store-1',
  };

  it('アイテムを購入済みにして実績を記録する', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new MarkAsBoughtUseCase(
      shoppingListRepository,
      passthroughUnitOfWork,
    ).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toEqual({ amount: 180, currency: 'JPY' });
    expect(dto.actualStoreId).toBe('actual-store-1');
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository, passthroughUnitOfWork).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository, passthroughUnitOfWork).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository, passthroughUnitOfWork).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });

  it('不正な価格は Domain のバリデーションエラーを伝搬し、ShoppingItemNotFoundError に握り潰さない', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const promise = new MarkAsBoughtUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
      ...input,
      actualPrice: { amount: -1, currency: 'JPY' },
    });

    await expect(promise).rejects.toThrow('Money amount must be non-negative');
    await expect(promise).rejects.not.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('bought への再適用は最新の購入実績で上書きする', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(100, 'JPY'),
          actualStoreId: 'old-store',
        }),
      ]),
    );

    const dto = await new MarkAsBoughtUseCase(
      shoppingListRepository,
      passthroughUnitOfWork,
    ).execute(input);

    expect(dto.actualPrice?.amount).toBe(180);
    expect(dto.actualStoreId).toBe('actual-store-1');
  });

  it('skipped からも bought へ更新できる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'skipped' })]));

    const dto = await new MarkAsBoughtUseCase(
      shoppingListRepository,
      passthroughUnitOfWork,
    ).execute(input);

    expect(dto.status).toBe('bought');
  });
});
