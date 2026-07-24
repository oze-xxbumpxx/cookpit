import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import {
  ShoppingItem,
  ShoppingList,
  type ShoppingItemProps,
} from '@cookpit/domain/src/shopping-list/shopping-list';
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
});
