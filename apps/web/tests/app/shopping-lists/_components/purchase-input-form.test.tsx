import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PurchaseInputForm } from '../../../../src/app/shopping-lists/_components/purchase-input-form';

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

describe('PurchaseInputForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PF-01: pending item は価格欄が空で実購入店舗が targetStoreId で初期化される', () => {
    const item = createShoppingItemDto({
      status: 'pending',
      actualStoreId: null,
      targetStoreId: 'store-a',
    });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('combobox', { name: '実購入店舗' }).textContent).toContain('店舗A');
  });

  it('PF-02: bought item を再タップすると価格がプレフィルされる', () => {
    const item = createShoppingItemDto({
      status: 'bought',
      actualPrice: { amount: 298, currency: 'JPY' },
      actualStoreId: 'store-b',
    });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('298');
  });

  it('PF-03: 実購入店舗の初期値は actualStoreId を優先する', () => {
    const item = createShoppingItemDto({
      status: 'bought',
      actualPrice: { amount: 298, currency: 'JPY' },
      actualStoreId: 'store-b',
      targetStoreId: 'store-a',
    });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: '実購入店舗' }).textContent).toContain('店舗B');
  });

  it('PF-04: 価格未入力・店舗未選択では送信ボタンが disabled', () => {
    const item = createShoppingItemDto({ targetStoreId: null, actualStoreId: null });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '購入を記録' }).hasAttribute('disabled')).toBe(true);
  });

  it('PF-05: 価格 0 円は送信可能', async () => {
    const user = userEvent.setup();
    const item = createShoppingItemDto({ targetStoreId: 'store-a' });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('価格'), '0');

    expect(screen.getByRole('button', { name: '購入を記録' }).hasAttribute('disabled')).toBe(false);
  });

  it('PF-06: 送信で onSubmit に価格・店舗が渡される', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const item = createShoppingItemDto({ targetStoreId: 'store-a' });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('価格'), '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    expect(onSubmit).toHaveBeenCalledWith(198, 'store-a');
  });

  it('PF-07: キャンセルボタンで onCancel が呼ばれる', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const item = createShoppingItemDto();
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('PF-08: submitting 中は送信ボタンが disabled', () => {
    const item = createShoppingItemDto({ targetStoreId: 'store-a' });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '購入を記録' }).hasAttribute('disabled')).toBe(true);
  });

  it('bought item のとき訂正の制約説明文が表示される', () => {
    const item = createShoppingItemDto({
      status: 'bought',
      actualPrice: { amount: 298, currency: 'JPY' },
      actualStoreId: 'store-b',
    });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        '金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。',
      ),
    ).toBeDefined();
  });

  it('pending item のとき訂正の制約説明文は表示されない', () => {
    const item = createShoppingItemDto({ status: 'pending' });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(
        '金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。',
      ),
    ).toBeNull();
  });
});
