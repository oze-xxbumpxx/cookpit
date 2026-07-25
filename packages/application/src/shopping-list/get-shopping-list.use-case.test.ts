import { beforeEach, describe, expect, it } from 'vitest';
import { GetShoppingListUseCase } from './get-shopping-list.use-case';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';
import { SHOPPING_LIST_ID, seededShoppingList, createRepositories } from './test-helpers';
import type { InMemoryShoppingListRepository } from './test-helpers';

let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  ({ shoppingListRepository } = createRepositories());
});

describe('GetShoppingListUseCase', () => {
  it('ShoppingListDto をローカル日付で返す', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new GetShoppingListUseCase(shoppingListRepository).execute({
      shoppingListId: SHOPPING_LIST_ID,
    });

    expect(dto.id).toBe(SHOPPING_LIST_ID);
    expect(dto.shoppingDate).toBe('2026-07-11');
    expect(dto.items).toHaveLength(1);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new GetShoppingListUseCase(shoppingListRepository).execute({
        shoppingListId: 'missing',
      }),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });
});
