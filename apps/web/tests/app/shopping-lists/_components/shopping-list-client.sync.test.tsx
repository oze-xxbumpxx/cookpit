import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
  PRODUCTS,
  STORES,
} from './shopping-list-test-fixtures';

const { postSync } = vi.hoisted(() => ({ postSync: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          sync: { $post: (...args: unknown[]) => postSync(...args) },
        },
      },
    },
  },
}));

import { ShoppingListClient } from '../../../../src/app/shopping-lists/_components/shopping-list-client';

describe('ShoppingListClient（献立の変更を反映）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(postSync).toHaveBeenCalledWith({ param: { id: 'shopping-list-1' } });
      expect(screen.getByText('追加1件')).toBeDefined();
      expect(screen.getByRole('checkbox', { name: /人参/ })).toBeDefined();
    });
  });

  it('SY-02: 追加が無いとき「変更はありませんでした」を表示する', async () => {
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
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(screen.getByText('変更はありませんでした')).toBeDefined();
    });
  });

  it('SY-03: completed のとき「献立の変更を反映」を表示しない', () => {
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'completed' })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    expect(screen.queryByRole('button', { name: '献立の変更を反映' })).toBeNull();
  });

  it('SY-04: 品目が消えたとき削除件数を表示する', async () => {
    const user = userEvent.setup();
    const remaining = createShoppingItemDto({ id: 'item-1', displayName: '醤油' });
    const removed = createShoppingItemDto({ id: 'item-2', displayName: '人参' });
    postSync.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'active', items: [remaining] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [remaining, removed] })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(screen.getByText('削除1件')).toBeDefined();
      expect(screen.queryByRole('checkbox', { name: /人参/ })).toBeNull();
    });
  });

  it('SY-05: 数量が変わったとき更新件数を表示する', async () => {
    const user = userEvent.setup();
    const before = createShoppingItemDto({
      id: 'item-1',
      displayName: '醤油',
      requiredAmount: { value: 1, unit: '本' },
    });
    const after = createShoppingItemDto({
      id: 'item-1',
      displayName: '醤油',
      requiredAmount: { value: 3, unit: '本' },
    });
    postSync.mockResolvedValue({
      ok: true,
      json: async () => createShoppingListDto({ status: 'active', items: [after] }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({ status: 'active', items: [before] })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(screen.getByText('更新1件')).toBeDefined();
    });
  });
});
