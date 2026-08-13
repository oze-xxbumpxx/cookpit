import { beforeEach, describe, expect, it } from 'vitest';
import { AddItemUseCase } from '../../src/shopping-list/add-item.use-case';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { ShoppingListNotFoundError } from '../../src/shopping-list/shopping-list-not-found.error';
import {
  SHOPPING_LIST_ID,
  PRODUCT_ID,
  STORE_ID,
  seededShoppingList,
  createRepositories,
} from './test-helpers';
import type { InMemoryShoppingListRepository } from './test-helpers';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  ({ shoppingListRepository } = createRepositories());
});

describe('AddItemUseCase', () => {
  it('productId と targetStoreId つきの手動アイテムを追加する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    const dto = await new AddItemUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
      shoppingListId: SHOPPING_LIST_ID,
      displayName: '牛乳',
      requiredAmount: { value: 1, unit: '本' },
      productId: PRODUCT_ID,
      targetStoreId: STORE_ID,
    });

    expect(dto).toMatchObject({
      productId: PRODUCT_ID,
      targetStoreId: STORE_ID,
      source: 'manually_added',
      status: 'pending',
    });
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('productId と targetStoreId を省略すると null で追加する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    const dto = await new AddItemUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
      shoppingListId: SHOPPING_LIST_ID,
      displayName: '牛乳',
      requiredAmount: { value: 1, unit: '本' },
    });

    expect(dto.productId).toBeNull();
    expect(dto.targetStoreId).toBeNull();
  });

  it.each([
    { productId: PRODUCT_ID, targetStoreId: null },
    { productId: null, targetStoreId: STORE_ID },
  ])(
    'productId=$productId と targetStoreId=$targetStoreId の組み合わせを保持する',
    async ({ productId, targetStoreId }) => {
      shoppingListRepository.seed(seededShoppingList('active', []));

      const dto = await new AddItemUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
        shoppingListId: SHOPPING_LIST_ID,
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
        productId,
        targetStoreId,
      });

      expect(dto.productId).toBe(productId);
      expect(dto.targetStoreId).toBe(targetStoreId);
    },
  );

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new AddItemUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
        shoppingListId: 'missing',
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
      }),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new AddItemUseCase(shoppingListRepository, passthroughUnitOfWork).execute({
        shoppingListId: SHOPPING_LIST_ID,
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
      }),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });
});
