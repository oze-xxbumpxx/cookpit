import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
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
});
