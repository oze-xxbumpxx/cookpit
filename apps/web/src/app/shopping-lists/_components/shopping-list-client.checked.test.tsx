import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
  fillPurchaseInputForm,
  STORES,
} from './shopping-list-test-fixtures';

const { getShoppingList, postItem, postBought, postChecked, postTargetStore } = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  postItem: vi.fn(),
  postBought: vi.fn(),
  postChecked: vi.fn(),
  postTargetStore: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          $get: (...args: unknown[]) => getShoppingList(...args),
          items: {
            $post: (...args: unknown[]) => postItem(...args),
            ':itemId': {
              bought: { $post: (...args: unknown[]) => postBought(...args) },
              checked: { $post: (...args: unknown[]) => postChecked(...args) },
              'target-store': { $post: (...args: unknown[]) => postTargetStore(...args) },
            },
          },
        },
      },
    },
  },
}));

import { ShoppingListClient } from './shopping-list-client';
describe('ShoppingListClient（チェック・購入・店舗再割当）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('LC-04: チェックをタップすると即座に bought になる（handleSetChecked 成功）', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
    expect(postChecked).toHaveBeenCalledWith({
      param: { id: shoppingList.id, itemId: 'item-1' },
      json: { checked: true },
    });
  });

  it('LC-05: 購入実績入力が成功すると該当 item のみ更新される', async () => {
    const user = userEvent.setup();
    postBought.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
        createShoppingItemDto({
          id: 'item-2',
          displayName: '味噌',
          targetStoreId: 'store-b',
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });
    expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('checkbox', { name: /味噌/ }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('LC-06: 楽観的更新のロールバック（失敗レスポンス。最重要）', async () => {
    const user = userEvent.setup();
    let resolveBought: (value: { ok: boolean }) => void = () => {};
    postBought.mockReturnValue(
      new Promise((resolve) => {
        resolveBought = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });

    await act(async () => {
      resolveBought({ ok: false });
    });

    await waitFor(() => {
      expect(screen.queryByText('✓ 店舗A で ¥198 購入')).toBeNull();
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  it('LC-07: 楽観的更新中のネットワークエラーでロールバックされる（最重要）', async () => {
    const user = userEvent.setup();
    let rejectBought: (reason: unknown) => void = () => {};
    postBought.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectBought = reject;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });

    await act(async () => {
      rejectBought(new Error('network'));
    });

    await waitFor(() => {
      expect(screen.queryByText('✓ 店舗A で ¥198 購入')).toBeNull();
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('LC-08: 同一 item への再送信で金額が上書きされる（S-3 上書き）', async () => {
    const user = userEvent.setup();
    postBought.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 350, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 298, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    const priceInput = screen.getByLabelText('価格') as HTMLInputElement;
    expect(priceInput.value).toBe('298');
    await user.clear(priceInput);
    await user.type(priceInput, '350');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥350 購入')).toBeDefined();
    });
    expect(postBought).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          actualPrice: { amount: 350, currency: 'JPY' },
        }),
      }),
    );
  });

  it('LC-11: 店舗再割当でグループが移動する', async () => {
    const user = userEvent.setup();
    postTargetStore.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-b',
          status: 'pending',
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '店舗A' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '店舗B' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '店舗B' })).toBeDefined();
      expect(screen.queryByRole('heading', { name: '店舗A' })).toBeNull();
    });
  });

  it('LC-12: bought 済み item の店舗再割当では実績値が変化しない', async () => {
    const user = userEvent.setup();
    postTargetStore.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-b',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '店舗A' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '店舗B' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });
  });

  it('LC-13: 店舗再割当が失敗するとエラー表示されグループ移動しない', async () => {
    const user = userEvent.setup();
    postTargetStore.mockResolvedValue({ ok: false });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '店舗A' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '店舗B' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByRole('heading', { name: '店舗A' })).toBeDefined();
  });

  it('LC-17: 操作中 item のみ disable され、他 item は操作可能なまま', async () => {
    const user = userEvent.setup();
    let resolveBought: (value: { ok: boolean }) => void = () => {};
    postBought.mockReturnValue(
      new Promise((resolve) => {
        resolveBought = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
        createShoppingItemDto({
          id: 'item-2',
          displayName: '味噌',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getAllByRole('button', { name: '金額を記録' })[0]);
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByRole('checkbox', { name: /味噌/ }).hasAttribute('disabled')).toBe(false);

    // 保留中の Promise を解決し、他テストの startTransition/useOptimistic に影響を残さない
    await act(async () => {
      resolveBought({ ok: false });
    });
  });

  it('LC-18: 連打しても bought.$post は 1 回のみ呼ばれる（O-05）', async () => {
    const user = userEvent.setup();
    let resolveBought: (value: { ok: boolean }) => void = () => {};
    postBought.mockReturnValue(
      new Promise((resolve) => {
        resolveBought = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    const submitButton = screen.getByRole('button', { name: '購入を記録' });
    await user.click(submitButton);
    await user.click(submitButton);

    expect(postBought).toHaveBeenCalledTimes(1);

    // 保留中の Promise を解決し、他テストの startTransition/useOptimistic に影響を残さない
    await act(async () => {
      resolveBought({ ok: false });
    });
  });

  it('LC-24: bought item を再タップするとチェックが外れ pending に戻る', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'pending',
          actualPrice: null,
          actualStoreId: null,
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
    });
    expect(postChecked).toHaveBeenCalledWith({
      param: { id: shoppingList.id, itemId: 'item-1' },
      json: { checked: false },
    });
  });

  it('LC-25: チェック操作の失敗レスポンスでロールバックされる', async () => {
    const user = userEvent.setup();
    let resolveChecked: (value: { ok: boolean }) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((resolve) => {
        resolveChecked = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      resolveChecked({ ok: false });
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  it('LC-28: チェック操作中のネットワークエラーでロールバックされる', async () => {
    const user = userEvent.setup();
    let rejectChecked: (reason: unknown) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectChecked = reject;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      rejectChecked(new Error('network'));
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('LC-26: チェックを外すと展開中の金額フォームが閉じる', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'pending',
          actualPrice: null,
          actualStoreId: null,
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    expect(screen.getByRole('button', { name: '購入を記録' })).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
    });
  });

  it('LC-27: チェック操作の連打は checked.$post を 1 回のみ呼ぶ', async () => {
    const user = userEvent.setup();
    let resolveChecked: (value: { ok: boolean }) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((resolve) => {
        resolveChecked = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    const checkbox = screen.getByRole('checkbox', { name: /醤油/ });
    await user.click(checkbox);
    await user.click(checkbox);

    expect(postChecked).toHaveBeenCalledTimes(1);

    // 保留中の Promise を解決し、他テストの startTransition/useOptimistic に影響を残さない
    await act(async () => {
      resolveChecked({ ok: false });
    });
  });
});
