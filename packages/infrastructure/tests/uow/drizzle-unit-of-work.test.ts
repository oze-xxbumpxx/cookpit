import {
  MealPlanId,
  Pantry,
  Quantity,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
} from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { DrizzlePantryRepository } from '../../src/repositories/drizzle-pantry.repository';
import { DrizzleShoppingListRepository } from '../../src/repositories/drizzle-shopping-list.repository';
import { createTestDb, DrizzleUnitOfWork } from '../testing/create-test-db';

const CREATED_AT = new Date('2026-07-12T03:00:00');

function createList(): ShoppingList {
  return ShoppingList.reconstruct({
    id: ShoppingListId.fromString('shopping-list-1'),
    mealPlanId: MealPlanId.fromString('meal-plan-1'),
    items: [
      ShoppingItem.reconstruct({
        id: ShoppingItemId.fromString('shopping-item-1'),
        productId: null,
        displayName: '玉ねぎ',
        requiredAmount: Quantity.of(2, '個'),
        amountNote: null,
        targetStore: null,
        status: 'pending',
        actualPrice: null,
        actualStore: null,
        source: 'from_meal_plan',
      }),
    ],
    shoppingDate: new Date('2026-07-11T00:00:00'),
    status: 'active',
    createdAt: CREATED_AT,
  });
}

describe('DrizzleUnitOfWork', () => {
  let uow: DrizzleUnitOfWork;
  let shoppingListRepository: DrizzleShoppingListRepository;
  let pantryRepository: DrizzlePantryRepository;

  beforeEach(async () => {
    const db = await createTestDb();
    uow = new DrizzleUnitOfWork(db);
    shoppingListRepository = new DrizzleShoppingListRepository(uow);
    pantryRepository = new DrizzlePantryRepository(uow);
  });

  it('execute が成功すると書き込みが残る', async () => {
    const list = createList();
    await uow.execute(async () => {
      await shoppingListRepository.save(list);
    });

    const found = await shoppingListRepository.findById(list.id);
    expect(found).not.toBeNull();
    expect(found?.items).toHaveLength(1);
  });

  it('execute 内の例外で単一集約の書き込みが残らない', async () => {
    const list = createList();
    await expect(
      uow.execute(async () => {
        await shoppingListRepository.save(list);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await shoppingListRepository.findById(list.id)).toBeNull();
  });

  it('execute 内の例外で集約横断の先行保存が残らない', async () => {
    const list = createList();
    const pantry = Pantry.create();
    pantry.addStock({
      productId: null,
      displayName: '玉ねぎ',
      amount: Quantity.of(1, '個'),
      purchasedAt: CREATED_AT,
      expiresAt: null,
      storedLocation: null,
      sourceShoppingItemId: null,
    });

    await expect(
      uow.execute(async () => {
        await shoppingListRepository.save(list);
        await pantryRepository.save(pantry);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await shoppingListRepository.findById(list.id)).toBeNull();
    const reloaded = await pantryRepository.find();
    expect(reloaded.stocks).toHaveLength(0);
  });

  it('execute せずに save すると通常どおり永続化される', async () => {
    const list = createList();
    await shoppingListRepository.save(list);
    expect(await shoppingListRepository.findById(list.id)).not.toBeNull();
  });

  it('ネストした execute は拒否する', async () => {
    await expect(
      uow.execute(async () => {
        await uow.execute(async () => undefined);
      }),
    ).rejects.toThrow('Nested UnitOfWork.execute is not supported');
  });

  it('execute 内のドメイン例外で書き込みが残らず例外は伝播する', async () => {
    const list = createList();
    class ShoppingListNotFoundError extends Error {
      constructor() {
        super('shopping list not found');
        this.name = 'ShoppingListNotFoundError';
      }
    }

    await expect(
      uow.execute(async () => {
        await shoppingListRepository.save(list);
        throw new ShoppingListNotFoundError();
      }),
    ).rejects.toThrow(ShoppingListNotFoundError);

    expect(await shoppingListRepository.findById(list.id)).toBeNull();
  });

  it('未完了の execute と並行した 2 本目も拒否する', async () => {
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = uow.execute(async () => {
      await started;
    });
    await expect(uow.execute(async () => undefined)).rejects.toThrow(
      'Nested UnitOfWork.execute is not supported',
    );
    release?.();
    await first;
  });
});
