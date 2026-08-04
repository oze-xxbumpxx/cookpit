import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { ReopenShoppingListUseCase } from '../../src/shopping-list/reopen-shopping-list.use-case';
import { ShoppingListNotFoundError } from '../../src/shopping-list/shopping-list-not-found.error';
import { SHOPPING_LIST_ID, seededShoppingList, createRepositories } from './test-helpers';
import type { InMemoryShoppingListRepository } from './test-helpers';

let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  ({ shoppingListRepository } = createRepositories());
});

describe('ReopenShoppingListUseCase', () => {
  it('completed のリストを active に戻して保存する', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    const dto = await new ReopenShoppingListUseCase(shoppingListRepository).execute({
      shoppingListId: SHOPPING_LIST_ID,
    });

    expect(dto.status).toBe('active');
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('存在しない shoppingListId は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new ReopenShoppingListUseCase(shoppingListRepository).execute({
        shoppingListId: 'missing',
      }),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('active（completed 以外）のリストは InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active'));

    await expect(
      new ReopenShoppingListUseCase(shoppingListRepository).execute({
        shoppingListId: SHOPPING_LIST_ID,
      }),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });
});
