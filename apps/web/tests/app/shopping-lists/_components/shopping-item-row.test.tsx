import type { PriceRecordDto, ProductDto, ShoppingItemDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingItemRow } from '../../../../src/app/shopping-lists/_components/shopping-item-row';

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
    pantryDeductedAmount: null,
    ...overrides,
  };
}

function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
    storeId: 'store-a',
    storeName: '店舗A',
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

/** 内訳が非 null になる商品（店舗A・店舗B の 2 件、weight で換算可能）。 */
function createProductWithBreakdown(): ProductDto {
  return createProductDto({
    id: 'product-a',
    priceHistory: [
      createPriceRecordDto({
        id: 'record-a',
        storeId: 'store-a',
        storeName: '店舗A',
        unitPriceAmount: 50,
        packageSizeUnit: 'g',
      }),
      createPriceRecordDto({
        id: 'record-b',
        storeId: 'store-b',
        storeName: '店舗B',
        unitPriceAmount: 80,
        packageSizeUnit: 'g',
      }),
    ],
  });
}

const STORES = [
  createStoreDto({ id: 'store-a', name: '店舗A' }),
  createStoreDto({ id: 'store-b', name: '店舗B' }),
];

function renderRow(props: Partial<Parameters<typeof ShoppingItemRow>[0]> = {}) {
  const defaults = {
    item: createShoppingItemDto(),
    stores: STORES,
    expanded: false,
    submitting: false,
    readOnly: false,
    unsynced: false,
    onToggleExpand: vi.fn(),
    onSetChecked: vi.fn(),
    onMarkAsBought: vi.fn(),
    onReassignStore: vi.fn(),
    onRequestRemove: vi.fn(),
    productMap: new Map<string, ProductDto>(),
  };
  const merged = { ...defaults, ...props };
  render(<ul>{<ShoppingItemRow {...merged} />}</ul>);
  return merged;
}

describe('ShoppingItemRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('IR-01: pending item は未チェックスタイルで表示される', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending' }) });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });

  it('IR-02: bought item は購入実績が併記される', () => {
    renderRow({
      item: createShoppingItemDto({
        status: 'bought',
        actualStoreId: 'store-a',
        actualPrice: { amount: 198, currency: 'JPY' },
      }),
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
  });

  it('IR-03: skipped item は例外を投げず未チェックスタイルで表示される', () => {
    renderRow({ item: createShoppingItemDto({ status: 'skipped' }) });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });

  it('IR-04: requiredAmount がある場合は数量が表示される', () => {
    renderRow({
      item: createShoppingItemDto({ requiredAmount: { value: 1, unit: '本' } }),
    });

    expect(screen.getByText('1本')).toBeDefined();
  });

  it('IR-05: amountNote のみの場合は数量ではなく amountNote が表示される', () => {
    renderRow({
      item: createShoppingItemDto({ requiredAmount: null, amountNote: '適量' }),
    });

    expect(screen.getByText('適量')).toBeDefined();
  });

  it('IR-06a: pending item のチェックボタン click で onSetChecked(id, true) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onSetChecked = vi.fn();
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', status: 'pending' }),
      onSetChecked,
    });

    await user.click(screen.getByRole('checkbox'));

    expect(onSetChecked).toHaveBeenCalledWith('item-1', true);
  });

  it('IR-06b: bought item のチェックボタン click で onSetChecked(id, false) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onSetChecked = vi.fn();
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', status: 'bought' }),
      onSetChecked,
    });

    await user.click(screen.getByRole('checkbox'));

    expect(onSetChecked).toHaveBeenCalledWith('item-1', false);
  });

  it('IR-07: 店舗バッジをタップして選択すると即座に onReassignStore が呼ばれる', async () => {
    const user = userEvent.setup();
    const onReassignStore = vi.fn();
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', targetStoreId: 'store-a' }),
      onReassignStore,
    });

    await user.click(screen.getByRole('button', { name: '店舗A' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '店舗B' }));

    expect(onReassignStore).toHaveBeenCalledWith('item-1', 'store-b');
  });

  it('IR-08: targetStoreId が null のとき「店舗未定」バッジが表示される', () => {
    renderRow({ item: createShoppingItemDto({ targetStoreId: null }) });

    expect(screen.getByRole('button', { name: '店舗未定' })).toBeDefined();
  });

  it('IR-09: bought かつ expanded のとき PurchaseInputForm が表示される', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }), expanded: true });

    expect(screen.getByRole('button', { name: '購入を記録' })).toBeDefined();
  });

  it('IR-10: expanded でないとき PurchaseInputForm は表示されない', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }), expanded: false });

    expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
  });

  it('IR-10b: pending かつ expanded のとき PurchaseInputForm は表示されない（bought ガード）', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending' }), expanded: true });

    expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
  });

  it('IR-11: submitting 中はチェックボタン・店舗バッジが disabled', () => {
    renderRow({ submitting: true });

    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '店舗A' }).hasAttribute('disabled')).toBe(true);
  });

  it('IR-12: bought item は「金額を記録」ボタンが表示される', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }) });

    expect(screen.getByRole('button', { name: '金額を記録' })).toBeDefined();
  });

  it('IR-13: pending item は「金額を記録」ボタンが表示されない', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending' }) });

    expect(screen.queryByRole('button', { name: '金額を記録' })).toBeNull();
  });

  it('IR-14: 「金額を記録」ボタン click で onToggleExpand が呼ばれる', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', status: 'bought' }),
      onToggleExpand,
    });

    await user.click(screen.getByRole('button', { name: '金額を記録' }));

    expect(onToggleExpand).toHaveBeenCalledWith('item-1');
  });

  // 完了済みリスト（readOnly）では、サーバーが 422 で拒否する操作を UI からも実行できないようにする。
  // 表示（品目名・数量・記録済み価格）は残す。詳細は docs/designs/completed-list-check-ui.md。
  it('IR-17: readOnly のときチェックボタンは disabled で、aria-checked は現状を保つ', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }), readOnly: true });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });

  it('IR-18: readOnly のとき「金額を記録」ボタンは表示されない', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }), readOnly: true });

    expect(screen.queryByRole('button', { name: '金額を記録' })).toBeNull();
  });

  it('IR-19: readOnly のとき店舗バッジは disabled', () => {
    renderRow({ item: createShoppingItemDto({ targetStoreId: 'store-a' }), readOnly: true });

    expect(screen.getByRole('button', { name: '店舗A' }).hasAttribute('disabled')).toBe(true);
  });

  it('IR-20: readOnly でも品目名・数量・記録済み価格は読める', () => {
    renderRow({
      item: createShoppingItemDto({
        status: 'bought',
        displayName: '醤油',
        requiredAmount: { value: 1, unit: '本' },
        actualStoreId: 'store-a',
        actualPrice: { amount: 198, currency: 'JPY' },
      }),
      readOnly: true,
    });

    expect(screen.getByText('醤油')).toBeDefined();
    expect(screen.getByText('1本')).toBeDefined();
    expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
  });

  it('IR-21: readOnly でないときは従来どおり操作できる', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }), readOnly: false });

    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '店舗A' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '金額を記録' })).toBeDefined();
  });

  it('IR-22: 削除ボタン click で onRequestRemove が item の id で呼ばれる', async () => {
    const user = userEvent.setup();
    const onRequestRemove = vi.fn();
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', displayName: '醤油' }),
      onRequestRemove,
    });

    await user.click(screen.getByRole('button', { name: '醤油を削除' }));

    expect(onRequestRemove).toHaveBeenCalledWith('item-1');
  });

  it('IR-23: readOnly のとき削除ボタンは表示されない', () => {
    renderRow({ item: createShoppingItemDto({ displayName: '醤油' }), readOnly: true });

    expect(screen.queryByRole('button', { name: '醤油を削除' })).toBeNull();
  });

  it('IR-24: submitting のとき削除ボタンは disabled', () => {
    renderRow({ item: createShoppingItemDto({ displayName: '醤油' }), submitting: true });

    expect(screen.getByRole('button', { name: '醤油を削除' }).hasAttribute('disabled')).toBe(true);
  });

  it('IR-15: pending item の aria-label は「〜をチェックする」', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending', displayName: '醤油' }) });

    expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe('醤油をチェックする');
  });

  it('IR-16: bought item の aria-label は「〜のチェックを外す」', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought', displayName: '醤油' }) });

    expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe('醤油のチェックを外す');
  });

  it('IR-25: priceDiff !== null のとき総額差の行が表示される', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({
        productId: 'product-a',
        requiredAmount: { value: 300, unit: 'g' },
      }),
      productMap,
    });

    expect(screen.getByText('店舗Aの方が約90円安い')).toBeDefined();
  });

  it('IR-26: priceDiff === null のとき総額差の行が表示されない', () => {
    renderRow({ item: createShoppingItemDto({ productId: null }) });

    expect(screen.queryByText(/円安い/)).toBeNull();
  });

  it('IR-27: 未購入品目でも hasBreakdown なら展開トリガーが表示される（P-4）', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({ status: 'pending', productId: 'product-a' }),
      productMap,
    });

    expect(screen.getByRole('button', { name: '店舗別の単価を見る' })).toBeDefined();
  });

  it('IR-28: 未購入かつ hasBreakdown=false なら展開トリガーは表示されない', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending' }) });

    expect(screen.queryByRole('button', { name: '店舗別の単価を見る' })).toBeNull();
    expect(screen.queryByRole('button', { name: '金額を記録' })).toBeNull();
  });

  it('IR-29: bought item は hasBreakdown の有無に関わらず「金額を記録」が表示される', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought' }) });

    expect(screen.getByRole('button', { name: '金額を記録' })).toBeDefined();
  });

  it('IR-30: bought かつ hasBreakdown=true でもラベルは「金額を記録」のまま', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({ status: 'bought', productId: 'product-a' }),
      productMap,
    });

    expect(screen.getByRole('button', { name: '金額を記録' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '店舗別の単価を見る' })).toBeNull();
  });

  it('IR-31: readOnly かつ未購入かつ hasBreakdown=true でもトリガーは表示されない', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({ status: 'pending', productId: 'product-a' }),
      readOnly: true,
      productMap,
    });

    expect(screen.queryByRole('button', { name: '店舗別の単価を見る' })).toBeNull();
  });

  it('IR-32: 未購入 + 展開時は内訳のみが表示され PurchaseInputForm は出ない', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({ status: 'pending', productId: 'product-a' }),
      expanded: true,
      productMap,
    });

    expect(screen.getByText('← 最安')).toBeDefined();
    expect(screen.getByText('+30円')).toBeDefined();
    expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
  });

  it('IR-33: 未購入 + expanded + hasBreakdown=false は展開パネル自体が表示されない（防御性）', () => {
    renderRow({
      item: createShoppingItemDto({ status: 'pending' }),
      expanded: true,
    });

    expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
    expect(screen.queryByText('← 最安')).toBeNull();
  });

  it('IR-34: 未購入品目の「店舗別の単価を見る」click で onToggleExpand が呼ばれる', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({ id: 'item-1', status: 'pending', productId: 'product-a' }),
      onToggleExpand,
      productMap,
    });

    await user.click(screen.getByRole('button', { name: '店舗別の単価を見る' }));

    expect(onToggleExpand).toHaveBeenCalledWith('item-1');
  });

  it('IR-35: productMap 経由の実データが総額差・内訳の両方に反映される（結合の要）', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({
        status: 'pending',
        productId: 'product-a',
        requiredAmount: { value: 300, unit: 'g' },
      }),
      expanded: true,
      productMap,
    });

    expect(screen.getByText('店舗Aの方が約90円安い')).toBeDefined();
    expect(screen.getByText('← 最安')).toBeDefined();
    expect(screen.getByText('+30円')).toBeDefined();
  });

  it('IR-36: productId が null のとき productMap に何を渡してもトリガー・総額差行が出ない', () => {
    const productMap = new Map([
      ['product-a', createProductWithBreakdown()],
      ['product-b', createProductWithBreakdown()],
    ]);
    renderRow({
      item: createShoppingItemDto({ productId: null, status: 'pending' }),
      productMap,
    });

    expect(screen.queryByText(/円安い/)).toBeNull();
    expect(screen.queryByRole('button', { name: '店舗別の単価を見る' })).toBeNull();
  });

  it('IR-37: 推奨店舗バッジと最安店舗（総額差）の食い違いを許容する（P-2）', () => {
    const productMap = new Map([['product-a', createProductWithBreakdown()]]);
    renderRow({
      item: createShoppingItemDto({
        status: 'pending',
        productId: 'product-a',
        targetStoreId: 'store-b',
        requiredAmount: { value: 300, unit: 'g' },
      }),
      productMap,
    });

    expect(screen.getByRole('button', { name: '店舗B' })).toBeDefined();
    expect(screen.getByText('店舗Aの方が約90円安い')).toBeDefined();
  });

  it('IR-38: unsynced のとき「未送信」インジケーターが表示される', () => {
    renderRow({ unsynced: true });

    expect(screen.getByText('未送信')).toBeDefined();
  });

  it('IR-39: unsynced でないとき「未送信」インジケーターは表示されない', () => {
    renderRow({ unsynced: false });

    expect(screen.queryByText('未送信')).toBeNull();
  });

  it('IR-40: unsynced でもチェックボタンの disabled は submitting/readOnly のみで決まる', () => {
    renderRow({ unsynced: true, submitting: false, readOnly: false });

    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(false);
  });
});
