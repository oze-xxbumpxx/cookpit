import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  buildStoreNameMap,
  describeRemoveConfirmation,
  describeSyncResult,
  diffSyncResult,
  formatShoppingDate,
  groupItemsByStore,
} from '../../../../src/app/shopping-lists/_utils/shopping-list-view';

function createStoreDto(overrides: Partial<StoreDto> = {}): StoreDto {
  return {
    id: '2539ec78-a1b3-49ec-8d4b-32a725a43ee7',
    name: '店舗X',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createShoppingItemDto(overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id: 'bddc9ee7-b38f-4718-8dff-8df67145784f',
    productId: null,
    displayName: '醤油',
    requiredAmount: { value: 1, unit: '本' },
    amountNote: null,
    targetStoreId: null,
    status: 'pending',
    actualPrice: null,
    actualStoreId: null,
    source: 'from_meal_plan',
    ...overrides,
  };
}

const STORE_X = createStoreDto({ id: 'store-x', name: '店舗X' });
const STORE_Y = createStoreDto({ id: 'store-y', name: '店舗Y' });
const UNKNOWN_STORE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('buildStoreNameMap', () => {
  it('SU-01: 店舗名 Map を構築する', () => {
    const map = buildStoreNameMap([STORE_X, STORE_Y]);

    expect(map.size).toBe(2);
    expect(map.get('store-x')).toBe('店舗X');
    expect(map.get('store-y')).toBe('店舗Y');
  });

  it('SU-02: 空配列は空 Map を返す', () => {
    const map = buildStoreNameMap([]);

    expect(map.size).toBe(0);
  });
});

describe('groupItemsByStore', () => {
  it('SU-03: 店舗未定グループが常に先頭に固定される', () => {
    const items = [
      createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-x' }),
      createShoppingItemDto({ id: 'item-2', targetStoreId: null }),
    ];

    const groups = groupItemsByStore(items, [STORE_X]);

    expect(groups[0].storeId).toBe(null);
    expect(groups[0].items.map((item) => item.id)).toEqual(['item-2']);
  });

  it('SU-04: 複数店舗の item が同一グループに集約される', () => {
    const items = [
      createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-x' }),
      createShoppingItemDto({ id: 'item-2', targetStoreId: 'store-y' }),
      createShoppingItemDto({ id: 'item-3', targetStoreId: 'store-x' }),
    ];

    const groups = groupItemsByStore(items, [STORE_X, STORE_Y]);

    const storeXGroup = groups.find((group) => group.storeId === 'store-x');
    expect(storeXGroup?.items.map((item) => item.id)).toEqual(['item-1', 'item-3']);
  });

  it('SU-05: グループ表示順は stores の返却順に従う', () => {
    const items = [
      createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-x' }),
      createShoppingItemDto({ id: 'item-2', targetStoreId: 'store-y' }),
    ];

    const groups = groupItemsByStore(items, [STORE_Y, STORE_X]);

    expect(groups.map((group) => group.storeId)).toEqual(['store-y', 'store-x']);
  });

  it('SU-06: item が 0 件の店舗はグループごと除外される', () => {
    const storeC = createStoreDto({ id: 'store-c', name: '店舗C' });
    const items = [createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-x' })];

    const groups = groupItemsByStore(items, [STORE_X, storeC]);

    expect(groups.some((group) => group.storeId === 'store-c')).toBe(false);
  });

  it('SU-07: 店舗未定 item が 0 件のとき店舗未定グループ自体が出力されない', () => {
    const items = [createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-x' })];

    const groups = groupItemsByStore(items, [STORE_X]);

    expect(groups.some((group) => group.storeId === null)).toBe(false);
  });

  it('SU-08: stores に存在しない targetStoreId は「不明な店舗」の独立グループになる（防御性）', () => {
    const items = [
      createShoppingItemDto({ id: 'item-1', targetStoreId: null }),
      createShoppingItemDto({ id: 'item-2', targetStoreId: UNKNOWN_STORE_ID }),
    ];

    const groups = groupItemsByStore(items, [STORE_X]);

    const unknownGroup = groups.find((group) => group.storeId === UNKNOWN_STORE_ID);
    expect(unknownGroup?.storeName).toBe('不明な店舗');
    expect(unknownGroup?.items.map((item) => item.id)).toEqual(['item-2']);
    // 店舗未定グループ（storeId: null）とは区別される。
    expect(groups.filter((group) => group.storeId === null)).toHaveLength(1);
  });

  it('SU-09: items が空配列のとき空配列を返す', () => {
    const groups = groupItemsByStore([], [STORE_X]);

    expect(groups).toEqual([]);
  });
});

describe('formatShoppingDate', () => {
  it('SU-10: 通常日を整形する', () => {
    expect(formatShoppingDate('2026-07-11')).toBe('7/11（土）の買い物リスト');
  });

  it('SU-11: 年またぎ日の境界を正しく算出する', () => {
    expect(formatShoppingDate('2026-12-31')).toBe('12/31（木）の買い物リスト');
    expect(formatShoppingDate('2027-01-01')).toBe('1/1（金）の買い物リスト');
  });

  it('SU-12: 曜日表記を網羅する', () => {
    expect(formatShoppingDate('2026-07-05')).toBe('7/5（日）の買い物リスト');
    expect(formatShoppingDate('2026-07-06')).toBe('7/6（月）の買い物リスト');
    expect(formatShoppingDate('2026-07-07')).toBe('7/7（火）の買い物リスト');
    expect(formatShoppingDate('2026-07-08')).toBe('7/8（水）の買い物リスト');
    expect(formatShoppingDate('2026-07-09')).toBe('7/9（木）の買い物リスト');
    expect(formatShoppingDate('2026-07-10')).toBe('7/10（金）の買い物リスト');
    expect(formatShoppingDate('2026-07-11')).toBe('7/11（土）の買い物リスト');
  });
});

describe('describeRemoveConfirmation', () => {
  it('DRC-01: 献立由来は同期で復活する旨を伝える', () => {
    const message = describeRemoveConfirmation(createShoppingItemDto({ source: 'from_meal_plan' }));

    expect(message).toContain('献立の変更を反映');
  });

  it('DRC-02: 手動追加の購入済み（金額あり）は金額も消える旨を伝える', () => {
    const message = describeRemoveConfirmation(
      createShoppingItemDto({
        source: 'manually_added',
        status: 'bought',
        actualPrice: { amount: 198, currency: 'JPY' },
      }),
    );

    expect(message).toBe('記録した金額も一緒に削除されます。元に戻せません。');
  });

  it('DRC-03: 手動追加の pending は既定の文言を返す', () => {
    const message = describeRemoveConfirmation(
      createShoppingItemDto({ source: 'manually_added', status: 'pending' }),
    );

    expect(message).toBe('削除すると元に戻せません。');
  });

  it('DRC-04: 献立由来かつ金額記録済みでは献立由来の文言を優先する', () => {
    const message = describeRemoveConfirmation(
      createShoppingItemDto({
        source: 'from_meal_plan',
        status: 'bought',
        actualPrice: { amount: 198, currency: 'JPY' },
      }),
    );

    expect(message).toContain('献立の変更を反映');
  });

  it('DRC-05: 購入済みでも金額未記録なら既定の文言を返す', () => {
    const message = describeRemoveConfirmation(
      createShoppingItemDto({
        source: 'manually_added',
        status: 'bought',
        actualPrice: null,
      }),
    );

    expect(message).toBe('削除すると元に戻せません。');
  });
});

describe('diffSyncResult / describeSyncResult', () => {
  it('P-01: 追加のみを数える', () => {
    const before = [createShoppingItemDto({ id: 'item-1' })];
    const after = [
      createShoppingItemDto({ id: 'item-1' }),
      createShoppingItemDto({ id: 'item-2', displayName: '人参' }),
    ];

    expect(diffSyncResult(before, after)).toEqual({
      addedCount: 1,
      removedCount: 0,
      updatedCount: 0,
    });
    expect(describeSyncResult(diffSyncResult(before, after))).toBe('追加1件');
  });

  it('P-02: 削除のみを数える', () => {
    const before = [
      createShoppingItemDto({ id: 'item-1' }),
      createShoppingItemDto({ id: 'item-2', displayName: '人参' }),
    ];
    const after = [createShoppingItemDto({ id: 'item-1' })];

    expect(diffSyncResult(before, after)).toEqual({
      addedCount: 0,
      removedCount: 1,
      updatedCount: 0,
    });
    expect(describeSyncResult(diffSyncResult(before, after))).toBe('削除1件');
  });

  it('P-03: 数量更新のみを数える', () => {
    const before = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: { value: 1, unit: '本' } }),
    ];
    const after = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: { value: 3, unit: '本' } }),
    ];

    expect(diffSyncResult(before, after)).toEqual({
      addedCount: 0,
      removedCount: 0,
      updatedCount: 1,
    });
    expect(describeSyncResult(diffSyncResult(before, after))).toBe('更新1件');
  });

  it('P-04: 追加・更新・削除の複合を過不足なく数える', () => {
    const before = [
      createShoppingItemDto({ id: 'keep', requiredAmount: { value: 1, unit: '本' } }),
      createShoppingItemDto({ id: 'update', requiredAmount: { value: 2, unit: '個' } }),
      createShoppingItemDto({ id: 'remove', displayName: '消える' }),
    ];
    const after = [
      createShoppingItemDto({ id: 'keep', requiredAmount: { value: 1, unit: '本' } }),
      createShoppingItemDto({ id: 'update', requiredAmount: { value: 5, unit: '個' } }),
      createShoppingItemDto({ id: 'add', displayName: '追加' }),
    ];

    expect(diffSyncResult(before, after)).toEqual({
      addedCount: 1,
      removedCount: 1,
      updatedCount: 1,
    });
    expect(describeSyncResult(diffSyncResult(before, after))).toBe('追加1件・更新1件・削除1件');
  });

  it('P-05: 差分が無ければ「変更はありませんでした」', () => {
    const items = [createShoppingItemDto({ id: 'item-1' })];

    expect(diffSyncResult(items, items)).toEqual({
      addedCount: 0,
      removedCount: 0,
      updatedCount: 0,
    });
    expect(describeSyncResult(diffSyncResult(items, items))).toBe('変更はありませんでした');
  });

  it('P-04b: unit だけ変わっても更新と数える', () => {
    const before = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: { value: 2, unit: '個' } }),
    ];
    const after = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: { value: 2, unit: '袋' } }),
    ];

    expect(diffSyncResult(before, after).updatedCount).toBe(1);
  });

  it('P-07: requiredAmount が両方 null なら変化なし', () => {
    const items = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: null, amountNote: '適量' }),
    ];

    expect(diffSyncResult(items, items).updatedCount).toBe(0);
  });

  it('P-08: null と数量の比較は例外を出さず更新扱いする', () => {
    const before = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: null, amountNote: '適量' }),
    ];
    const after = [
      createShoppingItemDto({ id: 'item-1', requiredAmount: { value: 1, unit: '個' } }),
    ];

    expect(diffSyncResult(before, after).updatedCount).toBe(1);
  });
});
