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
describe('ShoppingListClient（表示・手動追加・再取得）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('LC-01: 店舗未定グループが先頭に表示される（D-2）', () => {
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', targetStoreId: 'store-a' }),
        createShoppingItemDto({ id: 'item-2', displayName: '塩', targetStoreId: null }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0].textContent).toBe('店舗未定');
  });

  it('LC-02: 複数店舗の集約表示', () => {
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', targetStoreId: 'store-a' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌', targetStoreId: 'store-b' }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    expect(screen.getByRole('heading', { name: '店舗A' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '店舗B' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /醤油/ })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /味噌/ })).toBeDefined();
  });

  it('LC-03: items 0 件のとき空状態が表示され追加フォームは操作可能', () => {
    const shoppingList = createShoppingListDto({ items: [] });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    expect(screen.getByText('リストにアイテムがありません')).toBeDefined();
    expect(screen.getByRole('button', { name: '手動で追加' }).hasAttribute('disabled')).toBe(false);
  });

  it('LC-09: 手動追加が成功すると一覧に追加される', async () => {
    const user = userEvent.setup();
    postItem.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-new',
          displayName: '卵',
          targetStoreId: null,
          source: 'manually_added',
        }),
    });
    const shoppingList = createShoppingListDto({ items: [] });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '手動で追加' }));
    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /卵/ })).toBeDefined();
    });
  });

  it('LC-10: 手動追加が失敗するとエラー表示され一覧は変化しない', async () => {
    const user = userEvent.setup();
    postItem.mockResolvedValue({ ok: false });
    const shoppingList = createShoppingListDto({ items: [] });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '手動で追加' }));
    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.queryByRole('checkbox', { name: /卵/ })).toBeNull();
  });

  it('LC-14: フォーカス復帰で自動 refetch される（D-7）', async () => {
    getShoppingList.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingListDto({
          items: [
            createShoppingItemDto({
              id: 'item-1',
              displayName: '醤油',
              status: 'bought',
              actualPrice: { amount: 198, currency: 'JPY' },
              actualStoreId: 'store-a',
            }),
          ],
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(getShoppingList).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
  });

  it('LC-15: 手動更新ボタンで refetch される（D-7）', async () => {
    const user = userEvent.setup();
    getShoppingList.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingListDto({
          items: [
            createShoppingItemDto({
              id: 'item-1',
              displayName: '醤油',
              status: 'bought',
              actualPrice: { amount: 198, currency: 'JPY' },
              actualStoreId: 'store-a',
            }),
          ],
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(getShoppingList).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
  });

  it('LC-16: アンマウント後は focus イベントで refetch されない（防御性）', async () => {
    getShoppingList.mockResolvedValue({ ok: true, json: async () => createShoppingListDto() });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
    });
    const { unmount } = render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    unmount();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(getShoppingList).not.toHaveBeenCalled();
  });

  it('LC-19: ヘッダーに戻る導線と買い物日が表示される', () => {
    const shoppingList = createShoppingListDto({ shoppingDate: '2026-07-11', items: [] });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    expect(screen.getByRole('link', { name: '戻る' }).getAttribute('href')).toBe('/meal-plans');
    expect(screen.getByText('7/11（土）の買い物リスト')).toBeDefined();
  });

  it('LC-20: amountNote のみの item は数量ではなく amountNote が表示される（B-02）', () => {
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: 'にんにく',
          requiredAmount: null,
          amountNote: '適量',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    expect(screen.getByText('適量')).toBeDefined();
  });

  it('LC-21: refetch 成功で既存のエラーバナーがクリアされる（レビュー S-1）', async () => {
    const user = userEvent.setup();
    postBought.mockResolvedValue({ ok: false });
    getShoppingList.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingListDto({
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' })],
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));
    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    });
  });

  it('LC-22: silent な focus refetch では更新ボタンが disable されない（レビュー S-2）', async () => {
    getShoppingList.mockReturnValue(new Promise(() => {}));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(getShoppingList).toHaveBeenCalledTimes(1);
    const refreshButton = screen.getByRole('button', { name: '更新' }) as HTMLButtonElement;
    expect(refreshButton.disabled).toBe(false);
  });
});
