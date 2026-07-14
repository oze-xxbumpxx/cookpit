import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import { buildStoreNameMap, formatShoppingDate, groupItemsByStore } from './shopping-list-view';

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
