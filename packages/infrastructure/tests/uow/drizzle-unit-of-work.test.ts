import {
  MealPlanId,
  Pantry,
  Quantity,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
} from '@cookpit/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrizzleClient, TxConnection } from '../../src/db/client';
import { DrizzlePantryRepository } from '../../src/repositories/drizzle-pantry.repository';
import { DrizzleShoppingListRepository } from '../../src/repositories/drizzle-shopping-list.repository';
import { createTestDb, DrizzleUnitOfWork } from '../testing/create-test-db';

// createTxClient 節の各テストは本体で createTestDb()（PGlite の起動）を 2 回呼ぶため、
// 1 テストあたり 6〜8 秒かかる。既定の 5,000ms では CI の負荷が高い回だけ溢れて落ちる
// （PR #208 の CI で「execute 内で例外が出ても接続を閉じる」が 7,885ms でタイムアウト）。
vi.setConfig({ testTimeout: 30_000 });

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
        pantryDeductedAmount: null,
      }),
    ],
    shoppingDate: new Date('2026-07-11T00:00:00'),
    status: 'active',
    createdAt: CREATED_AT,
    coveredIngredients: null,
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
  // トランザクションだけ neon-serverless に載る。接続は 1 回の execute ごとに
  // 張って閉じる（ADR-0020）。
  describe('createTxClient', () => {
    /** `close` の呼ばれ方を数えられる TxConnection を作る。 */
    function trackedConnection(db: DrizzleClient): {
      create: () => Promise<TxConnection>;
      created: () => number;
      closed: () => number;
    } {
      let created = 0;
      let closed = 0;
      return {
        create: () => {
          created += 1;
          return Promise.resolve({
            db,
            close: () => {
              closed += 1;
              return Promise.resolve();
            },
          });
        },
        created: () => created,
        closed: () => closed,
      };
    }

    it('execute 内の書き込みは createTxClient 側の接続に載る', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const tx = trackedConnection(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { createTxClient: tx.create });
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

    it('createTxClient 側でも例外でロールバックする', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const tx = trackedConnection(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { createTxClient: tx.create });
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

    it('execute が成功したら接続を閉じる', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const tx = trackedConnection(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { createTxClient: tx.create });

      await separated.execute(async () => undefined);

      expect(tx.created()).toBe(1);
      expect(tx.closed()).toBe(1);
    });

    // ADR-0020 の中核。ここが漏れるとソケットがリクエストより長生きし、
    // 無関係なリクエストを巻き添えにする障害が再発する。
    it('execute 内で例外が出ても接続を閉じる', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const tx = trackedConnection(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { createTxClient: tx.create });
      const repository = new DrizzleShoppingListRepository(separated);
      const list = createList();

      await expect(
        separated.execute(async () => {
          await repository.save(list);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(tx.closed()).toBe(1);
    });

    it('close の失敗は work の例外を握り潰さない', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const separated = new DrizzleUnitOfWork(readDb, {
        createTxClient: () =>
          Promise.resolve({
            db: txDb,
            close: () => Promise.reject(new Error('close failed')),
          }),
      });

      await expect(
        separated.execute(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    });

    it('接続は execute のたびに張り直され、使い回されない', async () => {
      const readDb = await createTestDb();
      const txDb = await createTestDb();
      const tx = trackedConnection(txDb);
      const separated = new DrizzleUnitOfWork(readDb, { createTxClient: tx.create });

      await separated.execute(async () => undefined);
      await separated.execute(async () => undefined);

      expect(tx.created()).toBe(2);
      expect(tx.closed()).toBe(2);
    });

    // キルスイッチの肝。無効の間は WebSocket 接続を張らせない。
    it('useTransaction: false のとき createTxClient は呼ばれない', async () => {
      const readDb = await createTestDb();
      const tx = trackedConnection(readDb);
      const disabled = new DrizzleUnitOfWork(readDb, {
        useTransaction: false,
        createTxClient: tx.create,
      });
      const repository = new DrizzleShoppingListRepository(disabled);
      const list = createList();

      await disabled.execute(async () => {
        await repository.save(list);
      });

      expect(tx.created()).toBe(0);
      expect(await repository.findById(list.id)).not.toBeNull();
    });

    it('createTxClient 省略時は db 自身でトランザクションを張る', async () => {
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
