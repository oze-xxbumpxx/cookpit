import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingItemRow } from './shopping-item-row';

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
    onToggleExpand: vi.fn(),
    onSetChecked: vi.fn(),
    onMarkAsBought: vi.fn(),
    onReassignStore: vi.fn(),
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

  it('IR-15: pending item の aria-label は「〜をチェックする」', () => {
    renderRow({ item: createShoppingItemDto({ status: 'pending', displayName: '醤油' }) });

    expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe('醤油をチェックする');
  });

  it('IR-16: bought item の aria-label は「〜のチェックを外す」', () => {
    renderRow({ item: createShoppingItemDto({ status: 'bought', displayName: '醤油' }) });

    expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe('醤油のチェックを外す');
  });
});
