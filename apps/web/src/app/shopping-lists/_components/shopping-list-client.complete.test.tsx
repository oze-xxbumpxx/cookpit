import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
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

import { ShoppingListClient } from './shopping-list-client';

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
      />,
    );

    expect(screen.getByRole('button', { name: '買い物完了' })).toBeDefined();
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
