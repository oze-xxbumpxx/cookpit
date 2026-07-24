import type { ShoppingItemDto, ShoppingListDto, StoreDto } from '@cookpit/application';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getShoppingList,
  postItem,
  postBought,
  postTargetStore,
  postComplete,
  postReopen,
  postSync,
  routerPush,
  routerRefresh,
} = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  postItem: vi.fn(),
  postBought: vi.fn(),
  postTargetStore: vi.fn(),
  postComplete: vi.fn(),
  postReopen: vi.fn(),
  postSync: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          $get: (...args: unknown[]) => getShoppingList(...args),
          complete: {
            $post: (...args: unknown[]) => postComplete(...args),
          },
          reopen: {
            $post: (...args: unknown[]) => postReopen(...args),
          },
          sync: {
            $post: (...args: unknown[]) => postSync(...args),
          },
          items: {
            $post: (...args: unknown[]) => postItem(...args),
            ':itemId': {
              bought: {
                $post: (...args: unknown[]) => postBought(...args),
              },
              'target-store': {
                $post: (...args: unknown[]) => postTargetStore(...args),
              },
            },
          },
        },
      },
    },
  },
}));

import { ShoppingListClient } from './shopping-list-client';

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

function createShoppingListDto(overrides: Partial<ShoppingListDto> = {}): ShoppingListDto {
  return {
    id: 'shopping-list-1',
    mealPlanId: 'meal-plan-1',
    shoppingDate: '2026-07-11',
    status: 'active',
    items: [],
    createdAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

const STORE_A = createStoreDto({ id: 'store-a', name: '店舗A' });
const STORE_B = createStoreDto({ id: 'store-b', name: '店舗B' });
const STORES = [STORE_A, STORE_B];

async function fillPurchaseInputForm(itemDisplayName: string, price: string): Promise<void> {
  const user = userEvent.setup();
  const row = screen.getByRole('checkbox', { name: new RegExp(itemDisplayName) }).closest('li');
  if (row === null) {
    throw new Error('row not found');
  }
  await user.type(within(row as HTMLElement).getByLabelText('価格'), price);
}

describe('ShoppingListClient', () => {
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

  it('LC-04: チェックでフォームが展開される', async () => {
    const user = userEvent.setup();
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    expect(screen.getByRole('button', { name: '購入を記録' })).toBeDefined();
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
          status: 'pending',
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

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
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
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      resolveBought({ ok: false });
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
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
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      rejectBought(new Error('network'));
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
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

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
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

  it('LC-17: 操作中 item のみ disable され、他 item は操作可能なまま', async () => {
    const user = userEvent.setup();
    postBought.mockReturnValue(new Promise(() => {}));
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'pending',
        }),
        createShoppingItemDto({
          id: 'item-2',
          displayName: '味噌',
          targetStoreId: 'store-a',
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByRole('checkbox', { name: /味噌/ }).hasAttribute('disabled')).toBe(false);
  });

  it('LC-18: 連打しても bought.$post は 1 回のみ呼ばれる（O-05）', async () => {
    const user = userEvent.setup();
    postBought.mockReturnValue(new Promise(() => {}));
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

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await fillPurchaseInputForm('醤油', '198');
    const submitButton = screen.getByRole('button', { name: '購入を記録' });
    await user.click(submitButton);
    await user.click(submitButton);

    expect(postBought).toHaveBeenCalledTimes(1);
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
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
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

  it('CB-01: active のとき「買い物完了」ボタンを表示する', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    expect(screen.getByRole('button', { name: '買い物完了' })).toBeDefined();
  });

  it('SY-01: active のとき「献立の変更を反映」で sync を呼び、追加件数を表示する', async () => {
    const user = userEvent.setup();
    const existing = createShoppingItemDto({ id: 'item-1', displayName: '醤油' });
    const added = createShoppingItemDto({ id: 'item-2', displayName: '人参' });
    postSync.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'active', items: [existing, added] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [existing] })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(postSync).toHaveBeenCalledWith({ param: { id: 'shopping-list-1' } });
      expect(screen.getByText('1件の材料を追加しました')).toBeDefined();
      expect(screen.getByRole('checkbox', { name: /人参/ })).toBeDefined();
    });
  });

  it('SY-02: 追加が無いとき「追加する材料はありませんでした」を表示する', async () => {
    const user = userEvent.setup();
    const existing = createShoppingItemDto({ id: 'item-1', displayName: '醤油' });
    postSync.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'active', items: [existing] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [existing] })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(screen.getByText('追加する材料はありませんでした')).toBeDefined();
    });
  });

  it('SY-03: completed のとき「献立の変更を反映」を表示しない', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'completed' })}
        stores={STORES}
      />,
    );

    expect(screen.queryByRole('button', { name: '献立の変更を反映' })).toBeNull();
  });

  it('CB-02: completed のとき完了ボタンと手動追加ボタンを表示しない', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'completed' })}
        stores={STORES}
      />,
    );

    expect(screen.queryByRole('button', { name: '買い物完了' })).toBeNull();
    expect(screen.queryByRole('button', { name: '手動で追加' })).toBeNull();
  });

  it('CB-03: 完了ボタン click で complete API を呼ぶ', async () => {
    const user = userEvent.setup();
    const shoppingList = createShoppingListDto({ status: 'active' });
    postComplete.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'completed' }),
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    expect(postComplete).toHaveBeenCalledWith({ param: { id: shoppingList.id } });
  });

  it('CB-04: 完了成功で成功バナーと在庫リンクを表示し完了ボタンを隠す', async () => {
    const user = userEvent.setup();
    postComplete.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'completed' }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('買い物を完了しました')).toBeDefined();
      expect(screen.getByRole('link', { name: '在庫を見る' }).getAttribute('href')).toBe('/pantry');
      expect(screen.queryByRole('button', { name: '買い物完了' })).toBeNull();
    });
  });

  it('CB-05: 完了成功後も自動遷移や refresh をしない', async () => {
    const user = userEvent.setup();
    postComplete.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'completed' }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('買い物を完了しました')).toBeDefined();
    });
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('CB-06: 完了失敗で操作エラーを表示し active のままにする', async () => {
    const user = userEvent.setup();
    postComplete.mockResolvedValue({ ok: false });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: '買い物完了' })).toBeDefined();
  });

  it('CB-07: 完了 API の reject で通信エラーを表示する', async () => {
    const user = userEvent.setup();
    postComplete.mockRejectedValue(new Error('network'));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('CB-08: 確認 UI を挟まず complete API を即座に呼ぶ', async () => {
    const user = userEvent.setup();
    postComplete.mockReturnValue(new Promise(() => {}));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(postComplete).toHaveBeenCalledTimes(1);
  });

  it('CB-09: 完了 API の処理中は完了ボタンを disabled にする', async () => {
    const user = userEvent.setup();
    postComplete.mockReturnValue(new Promise(() => {}));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '買い物完了' }).hasAttribute('disabled')).toBe(
        true,
      );
    });
  });

  it('CB-10: 完了ボタンを連打しても complete API は 1 回だけ呼ぶ', async () => {
    const user = userEvent.setup();
    postComplete.mockReturnValue(new Promise(() => {}));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
      />,
    );
    const completeButton = screen.getByRole('button', { name: '買い物完了' });

    await user.click(completeButton);
    await user.click(completeButton);

    expect(postComplete).toHaveBeenCalledTimes(1);
  });

  it('CB-11: 完了後も item のチェックと店舗再割当 UI を残す', async () => {
    const user = userEvent.setup();
    const item = createShoppingItemDto({
      id: 'item-1',
      displayName: '醤油',
      targetStoreId: 'store-a',
      status: 'pending',
    });
    postComplete.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'completed', items: [item] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [item] })}
        stores={STORES}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('買い物を完了しました')).toBeDefined();
    });
    expect(screen.getByRole('checkbox', { name: /醤油/ })).toBeDefined();
    expect(screen.getByRole('button', { name: '店舗A' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '手動で追加' })).toBeNull();
  });

  it('completed のリストは「買い物を再開」を表示し、押すと active に戻り「手動で追加」が再表示される', async () => {
    const user = userEvent.setup();
    postReopen.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'active' }),
    });
    const shoppingList = createShoppingListDto({
      status: 'completed',
      items: [createShoppingItemDto()],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    // 完了状態では追加・完了ボタンは無く、「買い物を再開」がある
    expect(screen.queryByRole('button', { name: '手動で追加' })).toBeNull();
    expect(screen.queryByRole('button', { name: '買い物完了' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '買い物を再開' }));

    await waitFor(() => {
      expect(postReopen).toHaveBeenCalledWith({ param: { id: shoppingList.id } });
      expect(screen.getByRole('button', { name: '手動で追加' })).toBeDefined();
    });
  });
});
