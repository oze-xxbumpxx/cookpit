import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
  PRODUCTS,
  STORES,
} from './shopping-list-test-fixtures';

const { postComplete, postReopen, postChecked, postTargetStore, routerPush, routerRefresh } =
  vi.hoisted(() => ({
    postComplete: vi.fn(),
    postReopen: vi.fn(),
    postChecked: vi.fn(),
    postTargetStore: vi.fn(),
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
          complete: { $post: (...args: unknown[]) => postComplete(...args) },
          reopen: { $post: (...args: unknown[]) => postReopen(...args) },
          items: {
            ':itemId': {
              checked: { $post: (...args: unknown[]) => postChecked(...args) },
              'target-store': { $post: (...args: unknown[]) => postTargetStore(...args) },
            },
          },
        },
      },
    },
  },
}));

import { ShoppingListClient } from '../../../../src/app/shopping-lists/_components/shopping-list-client';

describe('ShoppingListClient（完了・再開）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('CB-01: active のとき「買い物完了」ボタンを表示する', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    expect(screen.getByRole('button', { name: '買い物完了' })).toBeDefined();
  });

  it('CB-02: completed のとき完了ボタンと手動追加ボタンを表示しない', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'completed' })}
        stores={STORES}
        products={PRODUCTS}
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
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    expect(postComplete).toHaveBeenCalledWith({
      param: { id: shoppingList.id },
      json: { stockAdditions: [] },
    });
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
        products={PRODUCTS}
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
        products={PRODUCTS}
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
        products={PRODUCTS}
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
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  // 在庫化の候補（bought 品目）が無ければ選ぶものが無いため、パネルを挟まず即 POST する。
  it('CB-08: bought 品目が無ければ在庫選択パネルを挟まず complete API を即座に呼ぶ', async () => {
    const user = userEvent.setup();
    postComplete.mockReturnValue(new Promise(() => {}));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'active',
          items: [createShoppingItemDto({ id: 'item-1', status: 'pending' })],
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('在庫に追加する品目')).toBeNull();
    expect(postComplete).toHaveBeenCalledTimes(1);
  });

  it('CB-09: 完了 API の処理中は完了ボタンを disabled にする', async () => {
    const user = userEvent.setup();
    postComplete.mockReturnValue(new Promise(() => {}));
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active' })}
        stores={STORES}
        products={PRODUCTS}
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
        products={PRODUCTS}
      />,
    );
    const completeButton = screen.getByRole('button', { name: '買い物完了' });

    await user.click(completeButton);
    await user.click(completeButton);

    expect(postComplete).toHaveBeenCalledTimes(1);
  });

  // 仕様変更（docs/designs/completed-list-check-ui.md）: 旧 CB-11 は「完了後も item のチェックと
  // 店舗再割当 UI を残す」を固定していたが、サーバーは completed のリストへの変更を 422 で拒否する
  // （ADR-0009 決定 3）。押せるのに必ず失敗する UI だったため、「表示は残すが操作できない」へ改める。
  it('CB-11: 完了後は item のチェックと店舗再割当が操作できない（表示は残す）', async () => {
    const user = userEvent.setup();
    const item = createShoppingItemDto({
      id: 'item-1',
      displayName: '醤油',
      targetStoreId: 'store-a',
      status: 'pending',
    });
    postComplete.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => createShoppingListDto({ status: 'completed', items: [item] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [item] })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物完了' }));

    await waitFor(() => {
      expect(screen.getByText('買い物を完了しました')).toBeDefined();
    });
    // 表示は残る
    expect(screen.getByRole('checkbox', { name: /醤油/ })).toBeDefined();
    expect(screen.getByRole('button', { name: '店舗A' })).toBeDefined();
    // ただし操作はできない
    expect(screen.getByRole('checkbox', { name: /醤油/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '店舗A' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: '手動で追加' })).toBeNull();
  });

  it('CB-12: completed のリストは操作要素が無効化され、回復導線が表示される', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'completed',
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' })],
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /醤油/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: '金額を記録' })).toBeNull();
    expect(
      screen.getByText(
        '完了済みのリストは編集できません。変更するには「買い物を再開」してください。',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: '買い物を再開' })).toBeDefined();
  });

  it('CB-13: 「買い物を再開」後は再び item を操作できる', async () => {
    const user = userEvent.setup();
    const item = createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' });
    postReopen.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => createShoppingListDto({ status: 'active', items: [item] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'completed', items: [item] })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '買い物を再開' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).hasAttribute('disabled')).toBe(false);
    });
    expect(
      screen.queryByText(
        '完了済みのリストは編集できません。変更するには「買い物を再開」してください。',
      ),
    ).toBeNull();
  });

  // 2 人利用で相手が先に完了した直後は、自分の画面がまだ active のままで 422 が返り得る。
  it('CB-14: チェック操作が 422 を返したときは回復手段を示す文言を出す', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'active',
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(
        screen.getByText('買い物完了後は変更できません。「買い物を再開」してください。'),
      ).toBeDefined();
    });
  });

  it('CB-15: 店舗再割当が 422 を返したときも同じ文言を出す', async () => {
    const user = userEvent.setup();
    postTargetStore.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'active',
          items: [
            createShoppingItemDto({ id: 'item-1', displayName: '醤油', targetStoreId: 'store-a' }),
          ],
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '店舗A' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '店舗B' }));

    await waitFor(() => {
      expect(
        screen.getByText('買い物完了後は変更できません。「買い物を再開」してください。'),
      ).toBeDefined();
    });
  });

  it('CB-16: 422 以外の失敗は従来どおり汎用文言を出す', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'active',
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  describe('在庫選択パネル', () => {
    const boughtItem = createShoppingItemDto({
      id: 'item-1',
      displayName: '玉ねぎ',
      status: 'bought',
      requiredAmount: { value: 3, unit: '個' },
    });

    function renderWithBoughtItems(items = [boughtItem]) {
      return render(
        <ShoppingListClient
          shoppingList={createShoppingListDto({ status: 'active', items })}
          stores={STORES}
          products={PRODUCTS}
        />,
      );
    }

    it('CB-17: bought 品目があるとき完了ボタンはパネルを開くだけで POST しない', async () => {
      const user = userEvent.setup();
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));

      expect(screen.getByText('在庫に追加する品目')).toBeDefined();
      expect(postComplete).not.toHaveBeenCalled();
    });

    it('CB-18: 「完了する」で選択品目を stockAdditions に載せて POST する', async () => {
      const user = userEvent.setup();
      postComplete.mockResolvedValue({
        ok: true,
        json: async () => createShoppingListDto({ status: 'completed' }),
      });
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('button', { name: '完了する' }));

      expect(postComplete).toHaveBeenCalledWith({
        param: { id: 'shopping-list-1' },
        json: {
          stockAdditions: [
            {
              itemId: 'item-1',
              amount: { value: 3, unit: '個' },
              storedLocation: null,
              // 賞味期限はパネルで入力させないため常に null（Q-1）。
              expiresAt: null,
            },
          ],
        },
      });
    });

    it('CB-19: 選択を外した品目は stockAdditions に含めない', async () => {
      const user = userEvent.setup();
      postComplete.mockResolvedValue({
        ok: true,
        json: async () => createShoppingListDto({ status: 'completed' }),
      });
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('checkbox', { name: '玉ねぎを在庫に追加しない' }));
      await user.click(screen.getByRole('button', { name: '完了する' }));

      expect(postComplete).toHaveBeenCalledWith({
        param: { id: 'shopping-list-1' },
        json: { stockAdditions: [] },
      });
    });

    it('CB-20: 完了成功で在庫追加件数を成功バナーに表示する', async () => {
      const user = userEvent.setup();
      postComplete.mockResolvedValue({
        ok: true,
        json: async () => createShoppingListDto({ status: 'completed' }),
      });
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('button', { name: '完了する' }));

      await waitFor(() => {
        expect(screen.getByText('買い物を完了しました')).toBeDefined();
        expect(screen.getByText('1件を在庫に追加しました')).toBeDefined();
      });
      expect(screen.queryByText('在庫に追加する品目')).toBeNull();
    });

    it('CB-21: 在庫追加 0 件のときは件数バナーを出さない', async () => {
      const user = userEvent.setup();
      postComplete.mockResolvedValue({
        ok: true,
        json: async () => createShoppingListDto({ status: 'completed' }),
      });
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('checkbox', { name: '玉ねぎを在庫に追加しない' }));
      await user.click(screen.getByRole('button', { name: '完了する' }));

      await waitFor(() => {
        expect(screen.getByText('買い物を完了しました')).toBeDefined();
      });
      expect(screen.queryByText('0件を在庫に追加しました')).toBeNull();
      expect(screen.getByRole('link', { name: '在庫を見る' })).toBeDefined();
    });

    it('CB-22: 完了が失敗したらパネルを開いたままにする（入力を失わない）', async () => {
      const user = userEvent.setup();
      postComplete.mockResolvedValue({ ok: false, status: 422 });
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('button', { name: '完了する' }));

      await waitFor(() => {
        expect(screen.getByText('操作に失敗しました。')).toBeDefined();
      });
      expect(screen.getByText('在庫に追加する品目')).toBeDefined();
    });

    it('CB-23: 「キャンセル」でパネルを閉じ POST しない', async () => {
      const user = userEvent.setup();
      renderWithBoughtItems();

      await user.click(screen.getByRole('button', { name: '買い物完了' }));
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByText('在庫に追加する品目')).toBeNull();
      expect(screen.getByRole('button', { name: '買い物完了' })).toBeDefined();
      expect(postComplete).not.toHaveBeenCalled();
    });
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
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

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
