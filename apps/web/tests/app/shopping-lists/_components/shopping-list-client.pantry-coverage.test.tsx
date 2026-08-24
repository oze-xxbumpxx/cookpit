import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCoveredIngredientDto,
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

describe('ShoppingListClient（在庫カバー可視化）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PC-01: 部分控除があるとき数量下に「在庫で n」を表示する（P-2）', () => {
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          requiredAmount: { value: 1, unit: '本' },
          pantryDeductedAmount: { value: 1, unit: '本' },
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    expect(screen.getByText('在庫で 1本')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /醤油/ }).className).toContain('size-6');
  });

  it('PC-02: covered-only のとき EmptyState を出さず「在庫で足りる」を出す（D-6）', () => {
    const shoppingList = createShoppingListDto({
      items: [],
      coveredIngredients: [createCoveredIngredientDto({ displayName: '牛乳' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    expect(screen.queryByText('リストにアイテムがありません')).toBeNull();
    expect(screen.getByRole('button', { name: /在庫で足りる/ })).toBeDefined();
  });

  it('PC-03: レガシー（null）ではヒントも折りたたみも出さない', () => {
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
      coveredIngredients: null,
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    expect(screen.queryByText(/在庫で /)).toBeNull();
    expect(screen.queryByRole('button', { name: /在庫で足りる/ })).toBeNull();
  });

  it('PC-04: Sync 成功で coveredIngredients も置換する（D-5）', async () => {
    const user = userEvent.setup();
    const existing = createShoppingItemDto({ id: 'item-1', displayName: '醤油' });
    postSync.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingListDto({
          status: 'active',
          items: [existing],
          coveredIngredients: [createCoveredIngredientDto({ displayName: '牛乳' })],
        }),
    });
    render(
      <ShoppingListClient
        shoppingList={createShoppingListDto({
          status: 'active',
          items: [existing],
          coveredIngredients: null,
        })}
        stores={STORES}
        products={PRODUCTS}
      />,
    );

    expect(screen.queryByRole('button', { name: /在庫で足りる/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '献立の変更を反映' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /在庫で足りる/ })).toBeDefined();
    });
  });

  it('PC-05: 「在庫で足りる」を開いてもチェックボックスは無い（P-1）', async () => {
    const user = userEvent.setup();
    const shoppingList = createShoppingListDto({
      items: [],
      coveredIngredients: [createCoveredIngredientDto({ displayName: '牛乳' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('button', { name: /在庫で足りる/ }));

    expect(screen.getByText('牛乳')).toBeDefined();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('PC-06: 「やっぱり買う」操作は存在しない（P-3）', () => {
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          pantryDeductedAmount: { value: 1, unit: '本' },
        }),
      ],
      coveredIngredients: [createCoveredIngredientDto()],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    expect(screen.queryByText('やっぱり買う')).toBeNull();
    expect(screen.queryByRole('button', { name: /やっぱり買う/ })).toBeNull();
  });
});
