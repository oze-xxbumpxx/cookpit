import {
  MealPlanId,
  Money,
  ProductId,
  Quantity,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
  StoreId,
} from '@cookpit/domain';
import type { ShoppingItemProps } from '@cookpit/domain';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DrizzleClient } from '../db/client';
import { shoppingItems, shoppingLists } from '../db/schema';
import { createTestDb } from '../testing/create-test-db';
import { DrizzleShoppingListRepository } from './drizzle-shopping-list.repository';

const CREATED_AT = new Date('2026-07-12T03:00:00');

function createItem(overrides: Partial<ShoppingItemProps> = {}): ShoppingItem {
  return ShoppingItem.reconstruct({
    id: ShoppingItemId.fromString('shopping-item-1'),
    productId: ProductId.fromString('product-1'),
    displayName: '玉ねぎ',
    requiredAmount: Quantity.of(2.5, '個'),
    amountNote: null,
    targetStore: StoreId.fromString('store-1'),
    status: 'bought',
    actualPrice: Money.of(198.5, 'JPY'),
    actualStore: StoreId.fromString('store-2'),
    source: 'from_meal_plan',
    ...overrides,
  });
}

interface CreateListOptions {
  id?: string;
  mealPlanId?: string;
  items?: ShoppingItem[];
  shoppingDate?: Date;
  status?: 'active' | 'completed';
  createdAt?: Date;
}

function createList(options: CreateListOptions = {}): ShoppingList {
  return ShoppingList.reconstruct({
    id: ShoppingListId.fromString(options.id ?? 'shopping-list-1'),
    mealPlanId: MealPlanId.fromString(options.mealPlanId ?? 'meal-plan-1'),
    items: options.items ?? [createItem()],
    shoppingDate: options.shoppingDate ?? new Date('2026-07-11T00:00:00'),
    status: options.status ?? 'active',
    createdAt: options.createdAt ?? CREATED_AT,
  });
}

function requireList(list: ShoppingList | null): ShoppingList {
  if (list === null) {
    throw new Error('Expected shopping list in test');
  }
  return list;
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('DrizzleShoppingListRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzleShoppingListRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzleShoppingListRepository(db);
  });

  it('save() → findById() で items と nullable 値を復元する', async () => {
    const amountItem = createItem();
    const noteItem = createItem({
      id: ShoppingItemId.fromString('shopping-item-2'),
      productId: null,
      displayName: '塩',
      requiredAmount: null,
      amountNote: '適量',
      targetStore: null,
      status: 'pending',
      actualPrice: null,
      actualStore: null,
      source: 'manually_added',
    });
    const shoppingList = createList({ items: [amountItem, noteItem] });

    await repository.save(shoppingList);

    const found = requireList(await repository.findById(shoppingList.id));
    expect(found.id.equals(shoppingList.id)).toBe(true);
    expect(found.mealPlanId.equals(shoppingList.mealPlanId)).toBe(true);
    expect(toLocalDateString(found.shoppingDate)).toBe('2026-07-11');
    expect(found.status).toBe('active');
    expect(found.items).toHaveLength(2);

    const foundAmountItem = found.items.find((item) => item.id.equals(amountItem.id));
    expect(foundAmountItem?.productId?.value).toBe('product-1');
    expect(foundAmountItem?.requiredAmount?.value).toBe(2.5);
    expect(foundAmountItem?.requiredAmount?.unit).toBe('個');
    expect(foundAmountItem?.amountNote).toBeNull();
    expect(foundAmountItem?.targetStore?.value).toBe('store-1');
    expect(foundAmountItem?.actualPrice?.amount).toBe(198.5);
    expect(foundAmountItem?.actualPrice?.currency).toBe('JPY');
    expect(foundAmountItem?.actualStore?.value).toBe('store-2');

    const foundNoteItem = found.items.find((item) => item.id.equals(noteItem.id));
    expect(foundNoteItem?.productId).toBeNull();
    expect(foundNoteItem?.requiredAmount).toBeNull();
    expect(foundNoteItem?.amountNote).toBe('適量');
    expect(foundNoteItem?.targetStore).toBeNull();
    expect(foundNoteItem?.actualPrice).toBeNull();
    expect(foundNoteItem?.actualStore).toBeNull();
  });

  it('空 DB で findById() / findByMealPlanId() は null を返す', async () => {
    expect(await repository.findById(ShoppingListId.fromString('missing-list'))).toBeNull();
    expect(await repository.findByMealPlanId(MealPlanId.fromString('missing-plan'))).toBeNull();
  });

  it('findByMealPlanId() は保存済み mealPlanId で取得できる', async () => {
    const shoppingList = createList();
    await repository.save(shoppingList);

    const found = requireList(await repository.findByMealPlanId(shoppingList.mealPlanId));
    expect(found.id.equals(shoppingList.id)).toBe(true);
  });

  it('同一 mealPlanId の ShoppingList は UNIQUE 制約により保存できない', async () => {
    await repository.save(createList({ id: 'shopping-list-1' }));

    await expect(
      repository.save(createList({ id: 'shopping-list-2', mealPlanId: 'meal-plan-1' })),
    ).rejects.toThrow();
  });

  it('同一 id の再 save() は status のみ更新し不変フィールドを維持する', async () => {
    const original = createList();
    await repository.save(original);

    const changed = createList({
      mealPlanId: 'meal-plan-changed',
      shoppingDate: new Date('2026-07-18T00:00:00'),
      status: 'completed',
      createdAt: new Date('2026-07-13T03:00:00'),
    });
    await repository.save(changed);

    const rows = await db
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.id, original.id.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mealPlanId).toBe('meal-plan-1');
    expect(rows[0]?.shoppingDate).toBe('2026-07-11');
    expect(rows[0]?.createdAt).toEqual(CREATED_AT);
    expect(rows[0]?.status).toBe('completed');
  });

  it('複数 item のバッチ upsert は各行を自身の値で更新する（excluded.* 参照）', async () => {
    const itemA = createItem({ id: ShoppingItemId.fromString('shopping-item-a') });
    const itemB = createItem({
      id: ShoppingItemId.fromString('shopping-item-b'),
      displayName: '人参',
    });
    await repository.save(createList({ items: [itemA, itemB] }));

    // 同一 id で異なる値へ再 save → ON CONFLICT の更新経路をバッチで通す。
    const updatedA = createItem({
      id: ShoppingItemId.fromString('shopping-item-a'),
      actualPrice: Money.of(111, 'JPY'),
    });
    const updatedB = createItem({
      id: ShoppingItemId.fromString('shopping-item-b'),
      displayName: '人参',
      actualPrice: Money.of(222, 'JPY'),
    });
    await repository.save(createList({ items: [updatedA, updatedB] }));

    const found = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    const byId = new Map(found.items.map((item) => [item.id.value, item.actualPrice?.amount]));
    expect(byId.get('shopping-item-a')).toBe(111);
    expect(byId.get('shopping-item-b')).toBe(222);
  });

  it('再 save() で削除済み item を同期し、0 件では全削除する', async () => {
    const firstItem = createItem();
    const secondItem = createItem({ id: ShoppingItemId.fromString('shopping-item-2') });
    const original = createList({ items: [firstItem, secondItem] });
    await repository.save(original);

    await repository.save(createList({ items: [secondItem] }));
    let rows = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.shoppingListId, original.id.value));
    expect(rows.map((row) => row.id)).toEqual(['shopping-item-2']);

    await repository.save(createList({ items: [] }));
    rows = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.shoppingListId, original.id.value));
    expect(rows).toHaveLength(0);
  });

  it('removeItem() で取り除いた item は save() 後に行ごと消える', async () => {
    const firstItem = createItem();
    const secondItem = createItem({ id: ShoppingItemId.fromString('shopping-item-2') });
    await repository.save(createList({ items: [firstItem, secondItem] }));

    const loaded = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    loaded.removeItem(ShoppingItemId.fromString('shopping-item-1'));
    await repository.save(loaded);

    const found = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    expect(found.items.map((item) => item.id.value)).toEqual(['shopping-item-2']);
  });

  it('removeItem() で全件を取り除くと item 行が 0 件になりリスト本体は残る', async () => {
    const firstItem = createItem();
    const secondItem = createItem({ id: ShoppingItemId.fromString('shopping-item-2') });
    await repository.save(createList({ items: [firstItem, secondItem] }));

    const loaded = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    loaded.removeItem(ShoppingItemId.fromString('shopping-item-1'));
    loaded.removeItem(ShoppingItemId.fromString('shopping-item-2'));
    await repository.save(loaded);

    const found = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    expect(found.items).toHaveLength(0);
  });

  it('numeric カラムは number 型として復元される', async () => {
    const shoppingList = createList();
    await repository.save(shoppingList);

    const found = requireList(await repository.findById(shoppingList.id));
    const item = found.items[0];
    expect(typeof item?.requiredAmount?.value).toBe('number');
    expect(typeof item?.actualPrice?.amount).toBe('number');
  });

  it('shoppingDate はタイムゾーンによる日付ずれなく往復する', async () => {
    const shoppingList = createList({ shoppingDate: new Date('2026-07-11T00:00:00') });
    await repository.save(shoppingList);

    const found = requireList(await repository.findById(shoppingList.id));
    expect(toLocalDateString(found.shoppingDate)).toBe(
      toLocalDateString(shoppingList.shoppingDate),
    );
  });
  it('IR-SL-10: countItemsByStore() は targetStore / actualStore の参照を数える', async () => {
    const storeA = StoreId.fromString('store-1');
    const storeB = StoreId.fromString('store-2');
    const storeC = StoreId.fromString('store-3');
    await repository.save(
      createList({
        items: [
          // targetStore のみが storeA
          createItem({
            id: ShoppingItemId.fromString('item-target-only'),
            targetStore: storeA,
            status: 'pending',
            actualPrice: null,
            actualStore: null,
          }),
          // actualStore のみが storeA
          createItem({
            id: ShoppingItemId.fromString('item-actual-only'),
            targetStore: storeC,
            actualStore: storeA,
          }),
          // 両方が storeA。二重計上しないことの確認
          createItem({
            id: ShoppingItemId.fromString('item-both'),
            targetStore: storeA,
            actualStore: storeA,
          }),
          // storeA を参照しない
          createItem({
            id: ShoppingItemId.fromString('item-other'),
            targetStore: storeB,
            actualStore: storeB,
          }),
        ],
      }),
    );

    expect(await repository.countItemsByStore(storeA)).toBe(3);
    expect(await repository.countItemsByStore(storeB)).toBe(1);
  });

  it('IR-SL-11: countItemsByStore() は参照が無ければ 0 を返す', async () => {
    expect(await repository.countItemsByStore(StoreId.fromString('store-unused'))).toBe(0);
  });

  it('IR-07: findAllByStore() は targetStore 参照のリストを返す', async () => {
    await repository.save(
      createList({
        items: [
          createItem({
            targetStore: StoreId.fromString('store-1'),
            status: 'pending',
            actualPrice: null,
            actualStore: null,
          }),
        ],
      }),
    );

    const found = await repository.findAllByStore(StoreId.fromString('store-1'));

    expect(found).toHaveLength(1);
    expect(found[0]?.id.value).toBe('shopping-list-1');
  });

  it('IR-08: findAllByStore() は actualStore 参照のリストを返す', async () => {
    await repository.save(
      createList({
        items: [createItem({ targetStore: null, actualStore: StoreId.fromString('store-9') })],
      }),
    );

    const found = await repository.findAllByStore(StoreId.fromString('store-9'));

    expect(found).toHaveLength(1);
  });

  it('IR-09: findAllByStore() は completed のリストも返す', async () => {
    await repository.save(createList({ status: 'completed' }));

    const found = await repository.findAllByStore(StoreId.fromString('store-1'));

    expect(found).toHaveLength(1);
    expect(found[0]?.status).toBe('completed');
  });

  it('IR-10: findAllByStore() は該当品目が複数あってもリストを 1 度だけ返し、全品目を復元する', async () => {
    await repository.save(
      createList({
        items: [
          createItem({ id: ShoppingItemId.fromString('item-1') }),
          createItem({ id: ShoppingItemId.fromString('item-2') }),
          // 対象店舗を参照しない品目も、集約の完全復元のために含まれる必要がある
          // （欠けたまま save すると残りの品目が消えてしまう）
          createItem({
            id: ShoppingItemId.fromString('item-3'),
            targetStore: StoreId.fromString('store-other'),
            actualStore: StoreId.fromString('store-other'),
          }),
        ],
      }),
    );

    const found = await repository.findAllByStore(StoreId.fromString('store-1'));

    expect(found).toHaveLength(1);
    expect(found[0]?.items).toHaveLength(3);
  });

  it('IR-11: findAllByStore() は参照が無ければ空配列を返す', async () => {
    await repository.save(createList());

    expect(await repository.findAllByStore(StoreId.fromString('store-unused'))).toEqual([]);
  });

  it('IR-04(SL): findAllByStore() は他リストを巻き込まない', async () => {
    await repository.save(
      createList({
        id: 'shopping-list-1',
        mealPlanId: 'meal-plan-1',
        items: [createItem({ targetStore: StoreId.fromString('store-1'), actualStore: null })],
      }),
    );
    await repository.save(
      createList({
        id: 'shopping-list-2',
        mealPlanId: 'meal-plan-2',
        items: [
          createItem({
            id: ShoppingItemId.fromString('shopping-item-2'),
            targetStore: StoreId.fromString('store-other'),
            actualStore: null,
          }),
        ],
      }),
    );

    const found = await repository.findAllByStore(StoreId.fromString('store-1'));

    expect(found).toHaveLength(1);
    expect(found[0]?.id.value).toBe('shopping-list-1');
  });
});
