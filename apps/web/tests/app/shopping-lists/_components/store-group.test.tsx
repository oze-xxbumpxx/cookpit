import type { PriceRecordDto, ProductDto, ShoppingItemDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreGroup } from '../../../../src/app/shopping-lists/_components/store-group';

function createStoreDto(overrides: Partial<StoreDto> = {}): StoreDto {
  return {
    id: 'store-a',
    name: '店舗A',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createShoppingItemDto(overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id: 'item-1',
    productId: null,
    displayName: '醤油',
    requiredAmount: { value: 1, unit: '本' },
    amountNote: null,
    targetStoreId: 'store-a',
    status: 'pending',
    actualPrice: null,
    actualStoreId: null,
    source: 'from_meal_plan',
    ...overrides,
  };
}

function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
    storeId: 'store-a',
    storeName: 'イオン',
    priceAmount: 250,
    unitPriceAmount: 50,
    packageSizeValue: 500,
    packageSizeUnit: 'g',
    observedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-a',
    name: '醤油',
    aliases: [],
    category: '調味料',
    defaultUnit: '本',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const STORES = [createStoreDto({ id: 'store-a', name: 'イオン' })];

function renderStoreGroup(props: Partial<Parameters<typeof StoreGroup>[0]> = {}) {
  const defaults = {
    storeId: 'store-a',
    storeName: 'イオン',
    items: [createShoppingItemDto()],
    expandedItemId: null,
    submittingItemId: null,
    readOnly: false,
    pendingItemIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    onSetChecked: vi.fn(),
    onMarkAsBought: vi.fn(),
    onReassignStore: vi.fn(),
    onRequestRemove: vi.fn(),
    stores: STORES,
    productMap: new Map<string, ProductDto>(),
  };
  render(<StoreGroup {...defaults} {...props} />);
}

describe('StoreGroup', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SG-01: storeId が null のとき「店舗未定」ヘッダーが表示される', () => {
    renderStoreGroup({ storeId: null, storeName: '店舗未定' });

    expect(screen.getByRole('heading', { name: '店舗未定' })).toBeDefined();
  });

  it('SG-02: 推奨店舗バッジ相当のヘッダーに店舗名が表示される（N-09・S-6 案A）', () => {
    renderStoreGroup({ storeId: 'store-a', storeName: 'イオン' });

    expect(screen.getByRole('heading', { name: 'イオン' })).toBeDefined();
  });

  it('SG-03: item 一覧が展開される', () => {
    renderStoreGroup({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌' }),
        createShoppingItemDto({ id: 'item-3', displayName: '砂糖' }),
      ],
    });

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  // productId が null（デフォルト fixture）のときは price-comparison.ts の縮退ケース#1 により
  // priceDiff が常に null になるため、金額差は表示されない。productId 紐付き品目では表示される
  // ようになった（SG-08 参照。shopping-list-price-comparison で S-6 案A の前提が部分的に変わった）。
  it('SG-04: productId が null のとき金額差表示が存在しない', () => {
    renderStoreGroup();

    expect(screen.queryByText(/円安い/)).toBeNull();
  });

  it('SG-05: チェックボタン click で onSetChecked が呼ばれる（プロップ中継の確認）', async () => {
    const user = userEvent.setup();
    const onSetChecked = vi.fn();
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', status: 'pending' })],
      onSetChecked,
    });

    await user.click(screen.getByRole('checkbox'));

    expect(onSetChecked).toHaveBeenCalledWith('item-1', true);
  });

  it('SG-06: readOnly を全 item 行へ中継する', () => {
    renderStoreGroup({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌' }),
      ],
      readOnly: true,
    });

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox.hasAttribute('disabled')).toBe(true);
    }
  });

  it('SG-07: onRequestRemove を対象 item 行へ中継する', async () => {
    const user = userEvent.setup();
    const onRequestRemove = vi.fn();
    renderStoreGroup({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌' }),
      ],
      onRequestRemove,
    });

    await user.click(screen.getByRole('button', { name: '味噌を削除' }));

    expect(onRequestRemove).toHaveBeenCalledWith('item-2');
  });

  it('SG-08: productMap が ShoppingItemRow まで中継される（中継確認）', () => {
    const product = createProductDto({
      id: 'product-a',
      priceHistory: [
        createPriceRecordDto({
          id: 'record-a',
          storeId: 'store-a',
          storeName: 'イオン',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'record-b',
          storeId: 'store-b',
          storeName: 'ライフ',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
        }),
      ],
    });
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', productId: 'product-a' })],
      productMap: new Map([['product-a', product]]),
    });

    expect(screen.getByRole('button', { name: '店舗別の単価を見る' })).toBeDefined();
  });

  it('SG-09: pendingItemIds に含まれる item は unsynced として ShoppingItemRow へ中継される', () => {
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
      pendingItemIds: new Set(['item-1']),
    });

    expect(screen.getByText('未送信')).toBeDefined();
  });

  it('SG-10: pendingItemIds に含まれない item は未同期表示されない', () => {
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
      pendingItemIds: new Set(['item-2']),
    });

    expect(screen.queryByText('未送信')).toBeNull();
  });
});
