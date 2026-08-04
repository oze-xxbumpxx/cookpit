import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@cookpit/domain';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { SetItemCheckedUseCase } from '../../src/shopping-list/set-item-checked.use-case';
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

describe('SetItemCheckedUseCase', () => {
  const input = { shoppingListId: SHOPPING_LIST_ID, itemId: SHOPPING_ITEM_ID, checked: true };

  it('pending の品目に checked: true を送ると bought になる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'pending' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toBeNull();
    expect(dto.actualStoreId).toBeNull();
  });

  it('bought の品目に checked: false を送ると pending になり実績が null にクリアされる', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(198, 'JPY'),
          actualStoreId: 'store-1',
        }),
      ]),
    );

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('pending');
    expect(dto.actualPrice).toBeNull();
    expect(dto.actualStoreId).toBeNull();
  });

  it('冪等: 既に bought の品目に checked: true を送っても例外を投げず bought のまま返す', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(198, 'JPY'),
          actualStoreId: 'store-1',
        }),
      ]),
    );

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toEqual({ amount: 198, currency: 'JPY' });
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('冪等: 既に pending の品目に checked: false を送っても例外を投げず pending のまま返す', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'pending' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('pending');
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('skipped の品目に checked: true を送ると bought になる（非公開経路の挙動固定）', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'skipped' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
  });

  it('skipped の品目に checked: false を送っても no-op で skipped のまま返る', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'skipped' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('skipped');
  });

  it('価格未記録の bought 品目に checked: false を送ってもクラッシュせず pending になる', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({ status: 'bought', actualPrice: null, actualStoreId: null }),
      ]),
    );

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('pending');
    expect(dto.actualPrice).toBeNull();
    expect(dto.actualStoreId).toBeNull();
  });
});
