import type { MealPlanDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { postShoppingList, push } = vi.hoisted(() => ({
  postShoppingList: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        $post: (...args: unknown[]) => postShoppingList(...args),
      },
    },
  },
}));

import { ShoppingListEntryClient } from '../../../../src/app/shopping-lists/_components/shopping-list-entry-client';

function createMealPlanDto(overrides: Partial<MealPlanDto> = {}): MealPlanDto {
  return {
    id: '4a88f79a-6ef6-46d3-931f-eae7cf283ae8',
    weekIdentifier: '2026-07-04',
    status: 'draft',
    plannedRecipes: [],
    createdAt: '2026-07-04T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

describe('ShoppingListEntryClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('EC-01: mealPlan なしのとき空状態と /meal-plans への導線が表示される', () => {
    render(<ShoppingListEntryClient mealPlan={null} />);

    expect(screen.getByText('買い物リストは献立から作られます')).toBeDefined();
    const link = screen.getByRole('link', { name: '今週の献立を作る' });
    expect(link.getAttribute('href')).toBe('/meal-plans');
    expect(screen.queryByRole('button', { name: '買い物リストを作る' })).toBeNull();
    expect(screen.queryByRole('button', { name: '買い物リストを開く' })).toBeNull();
  });

  it('EC-02: draft のとき「買い物リストを作る」ラベルが表示される', () => {
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto({ status: 'draft' })} />);

    expect(screen.getByRole('button', { name: '買い物リストを作る' })).toBeDefined();
  });

  it('EC-03: draft 以外のとき「買い物リストを開く」ラベルが表示される', () => {
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto({ status: 'shopping' })} />);

    expect(screen.getByRole('button', { name: '買い物リストを開く' })).toBeDefined();
  });

  it('EC-04: 押下で POST が呼ばれ、成功で router.push される', async () => {
    const user = userEvent.setup();
    const mealPlan = createMealPlanDto({ status: 'draft' });
    postShoppingList.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x' }),
    });
    render(<ShoppingListEntryClient mealPlan={mealPlan} />);

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(postShoppingList).toHaveBeenCalledWith({ json: { mealPlanId: mealPlan.id } });
      expect(push).toHaveBeenCalledWith('/shopping-lists/x');
    });
  });

  it('EC-05: 失敗レスポンスで「操作に失敗しました。」が表示される', async () => {
    const user = userEvent.setup();
    postShoppingList.mockResolvedValue({ ok: false });
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto({ status: 'draft' })} />);

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('EC-06: 通信エラーで「通信エラーが発生しました。」が表示される', async () => {
    const user = userEvent.setup();
    postShoppingList.mockRejectedValue(new Error('network'));
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto({ status: 'draft' })} />);

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('EC-07: 送信中はボタンが disabled になり二重送信されない', async () => {
    const user = userEvent.setup();
    let resolvePost: (value: {
      ok: boolean;
      json: () => Promise<{ id: string }>;
    }) => void = () => {};
    postShoppingList.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto({ status: 'draft' })} />);

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リストを作る' }).hasAttribute('disabled'),
      ).toBe(true);
    });

    resolvePost({ ok: true, json: async () => ({ id: 'x' }) });
  });

  it('EC-08: ヘッダーにタイトルが表示される（画面間の導線はボトムナビ）', () => {
    render(<ShoppingListEntryClient mealPlan={createMealPlanDto()} />);

    expect(screen.getByRole('heading', { name: '買い物リスト' })).toBeDefined();
  });
});
