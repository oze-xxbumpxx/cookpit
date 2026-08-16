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
import type { DrizzleClient, TxConnectionProvider } from '../../src/db/client';
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

  it('useTransaction: false では例外後も先行書き込みが残る', async () => {
    const db = await createTestDb();
    const passthrough = new DrizzleUnitOfWork(db, { useTransaction: false });
    const listRepository = new DrizzleShoppingListRepository(passthrough);
    const list = createList();

    await expect(
      passthrough.execute(async () => {
        await listRepository.save(list);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await listRepository.findById(list.id)).not.toBeNull();
  });

  it('useTransaction: false でも未完了の execute と並行した 2 本目は拒否する', async () => {
    const db = await createTestDb();
    const passthrough = new DrizzleUnitOfWork(db, { useTransaction: false });
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = passthrough.execute(async () => {
      await started;
    });
    await expect(passthrough.execute(async () => undefined)).rejects.toThrow(
      'Nested UnitOfWork.execute is not supported',
    );
    release?.();
    await first;
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

  // 案 S（書き込み経路だけ別接続）の配線。本番は読み取りが neon-http、
  // トランザクションだけ WebSocket に載る。接続は使い回し、死んでいたら張り直す。
  describe('txConnectionProvider', () => {
    /** acquire 回数と discard 回数を数えるだけの provider。 */
    function providerOf(...clients: DrizzleClient[]): {
      provider: TxConnectionProvider;
      acquired: () => number;
      discarded: () => number;
    } {
      let acquireCount = 0;
      let discardCount = 0;
      return {
        provider: {
          acquire: () => {
            const client = clients[Math.min(acquireCount, clients.length - 1)];
            acquireCount += 1;
            if (client === undefined) {
              throw new Error('no client configured');
            }
            return client;
          },
          discard: async () => {
            discardCount += 1;
          },
        },
        acquired: () => acquireCount,
        discarded: () => discardCount,
      };
    }

    /** begin の時点で落ちる接続。凍結中に切られた WebSocket を模す。 */
    function deadClient(): DrizzleClient {
      return {
        transaction: () => Promise.reject(new Error('Connection terminated unexpectedly')),
      } as unknown as DrizzleClient;
    }

    it('execute 内の書き込みは provider 側の接続に載る', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const { provider } = providerOf(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { txConnectionProvider: provider });
      const repository = new DrizzleShoppingListRepository(separated);
      const list = createList();

      await separated.execute(async () => {
        await repository.save(list);
      });

      // execute の外では readDb を見るので、書き込み先が分かれていれば読めない。
      expect(await repository.findById(list.id)).toBeNull();

      const txRepository = new DrizzleShoppingListRepository(
        new DrizzleUnitOfWork(txDb, { useTransaction: false }),
      );
      expect(await txRepository.findById(list.id)).not.toBeNull();
    });

    it('provider 側でも例外でロールバックする', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const { provider } = providerOf(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { txConnectionProvider: provider });
      const repository = new DrizzleShoppingListRepository(separated);
      const list = createList();

      await expect(
        separated.execute(async () => {
          await repository.save(list);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const txRepository = new DrizzleShoppingListRepository(
        new DrizzleUnitOfWork(txDb, { useTransaction: false }),
      );
      expect(await txRepository.findById(list.id)).toBeNull();
    });

    // 本番障害（2026-08-15）の再現と回復。凍結明けの最初の書き込みで begin が落ちる。
    it('使い回した接続が死んでいたら捨てて張り直し、書き込みは成功する', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const { provider, acquired, discarded } = providerOf(deadClient(), txDb);
      const separated = new DrizzleUnitOfWork(readDb, { txConnectionProvider: provider });
      const repository = new DrizzleShoppingListRepository(separated);
      const list = createList();

      await separated.execute(async () => {
        await repository.save(list);
      });

      expect(discarded()).toBe(1);
      expect(acquired()).toBe(2);

      const txRepository = new DrizzleShoppingListRepository(
        new DrizzleUnitOfWork(txDb, { useTransaction: false }),
      );
      expect(await txRepository.findById(list.id)).not.toBeNull();
    });

    it('張り直した接続も死んでいたら例外を伝播する（無限リトライしない）', async () => {
      const readDb = await createTestDb();
      const { provider, acquired } = providerOf(deadClient(), deadClient());
      const separated = new DrizzleUnitOfWork(readDb, { txConnectionProvider: provider });

      await expect(separated.execute(async () => undefined)).rejects.toThrow(
        'Connection terminated unexpectedly',
      );
      expect(acquired()).toBe(2);
    });

    // work が始まった後の失敗は COMMIT 到達済みか判別できない。再実行してはいけない。
    it('work が始まった後の失敗はリトライしない', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const { provider, acquired, discarded } = providerOf(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { txConnectionProvider: provider });
      let workRuns = 0;

      await expect(
        separated.execute(async () => {
          workRuns += 1;
          throw new Error('Connection terminated unexpectedly');
        }),
      ).rejects.toThrow('Connection terminated unexpectedly');

      expect(workRuns).toBe(1);
      expect(discarded()).toBe(0);
      expect(acquired()).toBe(1);
    });

    // キルスイッチの肝。無効の間は WebSocket 接続を張らせない。
    it('useTransaction: false のとき provider に触らない', async () => {
      const readDb = await createTestDb();
      const { provider, acquired } = providerOf(readDb);
      const disabled = new DrizzleUnitOfWork(readDb, {
        useTransaction: false,
        txConnectionProvider: provider,
      });
      const repository = new DrizzleShoppingListRepository(disabled);
      const list = createList();

      await disabled.execute(async () => {
        await repository.save(list);
      });

      expect(acquired()).toBe(0);
      expect(await repository.findById(list.id)).not.toBeNull();
    });

    it('provider 省略時は db 自身でトランザクションを張る', async () => {
      const readDb = await createTestDb();
      const fallback = new DrizzleUnitOfWork(readDb);
      const repository = new DrizzleShoppingListRepository(fallback);
      const list = createList();

      await fallback.execute(async () => {
        await repository.save(list);
      });

      expect(await repository.findById(list.id)).not.toBeNull();
    });
  });
});
