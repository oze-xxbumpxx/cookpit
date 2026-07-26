import { describe, expect, it } from 'vitest';
import { MealPlanId } from '../meal-plan/meal-plan-id';
import { ProductId } from '../product/product-id';
import { Money } from '../shared/money';
import { Quantity } from '../shared/quantity';
import { StoreId } from '../shared/store';
import { ShoppingItemId } from './shopping-item-id';
import { ShoppingListId } from './shopping-list-id';
import { ShoppingItem, ShoppingList } from './shopping-list';

function createItem(): ShoppingItem {
  return ShoppingItem.create({
    productId: ProductId.fromString('product-1'),
    displayName: '玉ねぎ',
    requiredAmount: Quantity.of(2, '個'),
    amountNote: null,
    targetStore: StoreId.fromString('store-1'),
    source: 'from_meal_plan',
  });
}

function createList(items: ShoppingItem[] = [createItem()]): ShoppingList {
  return ShoppingList.create({
    mealPlanId: MealPlanId.fromString('meal-plan-1'),
    items,
    shoppingDate: new Date('2026-07-11T00:00:00'),
  });
}

function reconstructCompletedList(items: ShoppingItem[] = [createItem()]): ShoppingList {
  return ShoppingList.reconstruct({
    id: ShoppingListId.fromString('shopping-list-1'),
    mealPlanId: MealPlanId.fromString('meal-plan-1'),
    items,
    shoppingDate: new Date('2026-07-11T00:00:00'),
    status: 'completed',
    createdAt: new Date('2026-07-10T00:00:00'),
  });
}

describe('ShoppingItem', () => {
  it('displayName が空白のみの場合は拒否する', () => {
    expect(() =>
      ShoppingItem.create({
        productId: null,
        displayName: '   ',
        requiredAmount: Quantity.of(1, '個'),
        amountNote: null,
        targetStore: null,
        source: 'manually_added',
      }),
    ).toThrow('Display name is required');
  });

  it('requiredAmount と amountNote が両方 null の場合は拒否する', () => {
    expect(() =>
      ShoppingItem.create({
        productId: null,
        displayName: '塩',
        requiredAmount: null,
        amountNote: null,
        targetStore: null,
        source: 'manually_added',
      }),
    ).toThrow('Either requiredAmount or amountNote is required');
  });

  it('requiredAmount と amountNote が両方設定された場合は拒否する', () => {
    expect(() =>
      ShoppingItem.create({
        productId: null,
        displayName: '塩',
        requiredAmount: Quantity.of(1, '小さじ'),
        amountNote: '少々',
        targetStore: null,
        source: 'manually_added',
      }),
    ).toThrow('requiredAmount and amountNote cannot both be set');
  });

  it('requiredAmount のみで生成し初期値を設定する', () => {
    const item = createItem();

    expect(item.requiredAmount?.value).toBe(2);
    expect(item.amountNote).toBeNull();
    expect(item.status).toBe('pending');
    expect(item.actualPrice).toBeNull();
    expect(item.actualStore).toBeNull();
  });

  it('amountNote のみで生成できる', () => {
    const item = ShoppingItem.create({
      productId: null,
      displayName: '塩',
      requiredAmount: null,
      amountNote: '少々',
      targetStore: null,
      source: 'manually_added',
    });

    expect(item.requiredAmount).toBeNull();
    expect(item.amountNote).toBe('少々');
  });

  it('markAsBought で pending から bought にする', () => {
    const item = createItem();

    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    expect(item.status).toBe('bought');
    expect(item.actualPrice?.amount).toBe(198);
    expect(item.actualStore?.value).toBe('store-1');
    expect(item.isBought()).toBe(true);
  });

  it('markAsBought は bought に再適用して購入実績を上書きする', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    item.markAsBought(Money.of(150, 'JPY'), StoreId.fromString('store-2'));

    expect(item.status).toBe('bought');
    expect(item.actualPrice?.amount).toBe(150);
    expect(item.actualStore?.value).toBe('store-2');
  });

  it('markAsBought は skipped から bought への変更を許可する', () => {
    const item = createItem();
    item.markAsSkipped();

    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    expect(item.status).toBe('bought');
    expect(item.isBought()).toBe(true);
  });

  it('reassignStore は targetStore のみ変更して購入実績を維持する', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('actual-store'));

    item.reassignStore(StoreId.fromString('new-target-store'));

    expect(item.targetStore?.value).toBe('new-target-store');
    expect(item.status).toBe('bought');
    expect(item.actualPrice?.amount).toBe(198);
    expect(item.actualStore?.value).toBe('actual-store');
  });

  it('markAsSkipped は pending から skipped にする', () => {
    const item = createItem();

    item.markAsSkipped();

    expect(item.status).toBe('skipped');
    expect(item.isBought()).toBe(false);
  });

  it('markAsSkipped は bought からの変更を拒否する', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    expect(() => item.markAsSkipped()).toThrow("Cannot skip a ShoppingItem with status 'bought'");
  });

  it('markAsSkipped は skipped への再適用を拒否する', () => {
    const item = createItem();
    item.markAsSkipped();

    expect(() => item.markAsSkipped()).toThrow("Cannot skip a ShoppingItem with status 'skipped'");
  });

  it('isBought は pending で false を返す', () => {
    expect(createItem().isBought()).toBe(false);
  });

  it('check は pending から bought にし、actualPrice/actualStore に触れない', () => {
    const item = createItem();

    item.check();

    expect(item.status).toBe('bought');
    expect(item.actualPrice).toBeNull();
    expect(item.actualStore).toBeNull();
  });

  it('check は skipped からの呼び出しも許可し bought にする', () => {
    const item = createItem();
    item.markAsSkipped();

    item.check();

    expect(item.status).toBe('bought');
  });

  it('check は bought への再適用を冪等に許可する', () => {
    const item = createItem();
    item.check();

    expect(() => item.check()).not.toThrow();
    expect(item.status).toBe('bought');
  });

  it('check は markAsBought 済みの価格・店舗を破壊しない', () => {
    const item = createItem();
    item.markAsBought(Money.of(200, 'JPY'), StoreId.fromString('store-1'));

    item.check();

    expect(item.status).toBe('bought');
    expect(item.actualPrice?.amount).toBe(200);
    expect(item.actualStore?.value).toBe('store-1');
  });

  it('uncheck は bought から pending に戻し actualPrice/actualStore を null にクリアする', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    item.uncheck();

    expect(item.status).toBe('pending');
    expect(item.actualPrice).toBeNull();
    expect(item.actualStore).toBeNull();
  });

  it('uncheck は pending からの呼び出しを拒否する', () => {
    const item = createItem();

    expect(() => item.uncheck()).toThrow("Cannot uncheck a ShoppingItem with status 'pending'");
  });

  it('uncheck は skipped からの呼び出しを拒否する', () => {
    const item = createItem();
    item.markAsSkipped();

    expect(() => item.uncheck()).toThrow("Cannot uncheck a ShoppingItem with status 'skipped'");
  });

  it('uncheck は価格未記録の check() のみの item にも安全に適用できる', () => {
    const item = createItem();
    item.check();

    item.uncheck();

    expect(item.status).toBe('pending');
    expect(item.actualPrice).toBeNull();
    expect(item.actualStore).toBeNull();
  });
});

describe('ShoppingList', () => {
  it('create は active 状態と作成日時を設定する', () => {
    const before = Date.now();
    const list = createList([]);
    const after = Date.now();

    expect(list.status).toBe('active');
    expect(list.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(list.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('addItem は active 状態で item を追加する', () => {
    const list = createList([]);

    list.addItem(createItem());

    expect(list.items).toHaveLength(1);
  });

  it('addItem は completed 状態で拒否する', () => {
    const list = reconstructCompletedList([]);

    expect(() => list.addItem(createItem())).toThrow(
      "Cannot addItem a ShoppingList with status 'completed'",
    );
    expect(list.items).toHaveLength(0);
  });

  it('markAsBought は active 状態で対象 item を更新する', () => {
    const item = createItem();
    const list = createList([item]);

    list.markAsBought(item.id, Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    expect(list.items[0]?.status).toBe('bought');
  });

  it('markAsBought は completed 状態で拒否する', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);

    expect(() =>
      list.markAsBought(item.id, Money.of(198, 'JPY'), StoreId.fromString('store-1')),
    ).toThrow("Cannot markAsBought a ShoppingList with status 'completed'");
    expect(item.status).toBe('pending');
  });

  it('markAsBought は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() =>
      list.markAsBought(
        ShoppingItemId.fromString('missing'),
        Money.of(198, 'JPY'),
        StoreId.fromString('store-1'),
      ),
    ).toThrow('ShoppingItem not found');
  });

  it('reassignStore は active 状態で対象 item を更新する', () => {
    const item = createItem();
    const list = createList([item]);

    list.reassignStore(item.id, StoreId.fromString('store-2'));

    expect(list.items[0]?.targetStore?.value).toBe('store-2');
  });

  it('reassignStore は completed 状態で拒否する', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);

    expect(() => list.reassignStore(item.id, StoreId.fromString('store-2'))).toThrow(
      "Cannot reassignStore a ShoppingList with status 'completed'",
    );
  });

  it('reassignStore は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() =>
      list.reassignStore(ShoppingItemId.fromString('missing'), StoreId.fromString('store-2')),
    ).toThrow('ShoppingItem not found');
  });

  it('markAsSkipped は active 状態で対象 item を更新する', () => {
    const item = createItem();
    const list = createList([item]);

    list.markAsSkipped(item.id);

    expect(list.items[0]?.status).toBe('skipped');
  });

  it('markAsSkipped は completed 状態で拒否する', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);

    expect(() => list.markAsSkipped(item.id)).toThrow(
      "Cannot markAsSkipped a ShoppingList with status 'completed'",
    );
  });

  it('markAsSkipped は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() => list.markAsSkipped(ShoppingItemId.fromString('missing'))).toThrow(
      'ShoppingItem not found',
    );
  });

  it('removeItem は active 状態で対象 item を取り除く', () => {
    const target = createItem();
    const other = createItem();
    const list = createList([target, other]);

    list.removeItem(target.id);

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id.equals(other.id)).toBe(true);
  });

  it('removeItem は bought の item も購入実績ごと取り除く', () => {
    const item = createItem();
    const list = createList([item]);
    list.markAsBought(item.id, Money.of(198, 'JPY'), StoreId.fromString('store-1'));

    list.removeItem(item.id);

    expect(list.items).toHaveLength(0);
  });

  it('removeItem は manually_added の item も取り除く', () => {
    const manual = ShoppingItem.create({
      productId: null,
      displayName: '牛乳',
      requiredAmount: Quantity.of(1, '本'),
      amountNote: null,
      targetStore: null,
      source: 'manually_added',
    });
    const list = createList([createItem(), manual]);

    list.removeItem(manual.id);

    expect(list.items.some((item) => item.id.equals(manual.id))).toBe(false);
  });

  it('removeItem は他の item の状態に影響しない', () => {
    const first = createItem();
    const middle = createItem();
    const last = createItem();
    const list = createList([first, middle, last]);
    list.markAsBought(last.id, Money.of(298, 'JPY'), StoreId.fromString('store-2'));

    list.removeItem(middle.id);

    expect(list.items.map((item) => item.id.value)).toEqual([first.id.value, last.id.value]);
    expect(list.items[1]?.status).toBe('bought');
    expect(list.items[1]?.actualPrice?.amount).toBe(298);
  });

  it('removeItem は最後の 1 件を取り除いて空にできる', () => {
    const item = createItem();
    const list = createList([item]);

    list.removeItem(item.id);

    expect(list.items).toHaveLength(0);
  });

  it('removeItem は全件を順に取り除ける', () => {
    const first = createItem();
    const second = createItem();
    const list = createList([first, second]);

    list.removeItem(first.id);
    list.removeItem(second.id);

    expect(list.items).toHaveLength(0);
  });

  it('removeItem は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() => list.removeItem(ShoppingItemId.fromString('missing'))).toThrow(
      'ShoppingItem not found',
    );
    expect(list.items).toHaveLength(1);
  });

  it('removeItem は削除済み itemId の再削除を拒否する', () => {
    const item = createItem();
    const list = createList([item]);
    list.removeItem(item.id);

    expect(() => list.removeItem(item.id)).toThrow('ShoppingItem not found');
  });

  it('removeItem は completed 状態で拒否する', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);

    expect(() => list.removeItem(item.id)).toThrow(
      "Cannot removeItem a ShoppingList with status 'completed'",
    );
    expect(list.items).toHaveLength(1);
  });

  it('removeItem は reopen 後に再び可能になる', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);
    list.reopen();

    list.removeItem(item.id);

    expect(list.items).toHaveLength(0);
  });

  it('complete は active から completed に変更する', () => {
    const list = createList();

    list.complete();

    expect(list.status).toBe('completed');
  });

  it('complete は completed への再適用を拒否する', () => {
    const list = createList();
    list.complete();

    expect(() => list.complete()).toThrow("Cannot complete a ShoppingList with status 'completed'");
  });

  it('reopen は completed から active に戻す', () => {
    const list = reconstructCompletedList();

    list.reopen();

    expect(list.status).toBe('active');
  });

  it('reopen 後は addItem 等の更新操作が再び可能になる', () => {
    const list = reconstructCompletedList([]);
    list.reopen();

    expect(() => list.addItem(createItem())).not.toThrow();
    expect(list.items).toHaveLength(1);
  });

  it('reopen は active 状態では拒否する', () => {
    const list = createList();

    expect(() => list.reopen()).toThrow("Cannot reopen a ShoppingList with status 'active'");
  });

  it('items getter は配列の防御的コピーを返す', () => {
    const list = createList();
    const items = list.items;

    items.push(createItem());

    expect(list.items).toHaveLength(1);
  });

  it('shoppingDate getter は Date の防御的コピーを返す', () => {
    const list = createList();
    const shoppingDate = list.shoppingDate;

    shoppingDate.setFullYear(2099);

    expect(list.shoppingDate.getFullYear()).toBe(2026);
  });

  it('createdAt getter は Date の防御的コピーを返す', () => {
    const list = createList();
    const originalYear = list.createdAt.getFullYear();
    const createdAt = list.createdAt;

    createdAt.setFullYear(2099);

    expect(list.createdAt.getFullYear()).toBe(originalYear);
  });

  it('check は active 状態で対象 item を bought にする', () => {
    const item = createItem();
    const list = createList([item]);

    list.check(item.id);

    expect(list.items[0]?.status).toBe('bought');
  });

  it('check は completed 状態で拒否する', () => {
    const item = createItem();
    const list = reconstructCompletedList([item]);

    expect(() => list.check(item.id)).toThrow(
      "Cannot check a ShoppingList with status 'completed'",
    );
  });

  it('check は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() => list.check(ShoppingItemId.fromString('missing'))).toThrow(
      'ShoppingItem not found',
    );
  });

  it('uncheck は active 状態で対象 item を pending に戻す', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));
    const list = createList([item]);

    list.uncheck(item.id);

    expect(list.items[0]?.status).toBe('pending');
    expect(list.items[0]?.actualPrice).toBeNull();
  });

  it('uncheck は completed 状態で拒否する', () => {
    const item = createItem();
    item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));
    const list = reconstructCompletedList([item]);

    expect(() => list.uncheck(item.id)).toThrow(
      "Cannot uncheck a ShoppingList with status 'completed'",
    );
    expect(item.status).toBe('bought');
    expect(item.actualPrice?.amount).toBe(198);
  });

  it('uncheck は存在しない itemId を拒否する', () => {
    const list = createList();

    expect(() => list.uncheck(ShoppingItemId.fromString('missing'))).toThrow(
      'ShoppingItem not found',
    );
  });

  it('uncheck は pending item に対する ShoppingItem 側のエラーをそのまま伝播する', () => {
    const item = createItem();
    const list = createList([item]);

    expect(() => list.uncheck(item.id)).toThrow(
      "Cannot uncheck a ShoppingItem with status 'pending'",
    );
  });
});
