import type { MealPlanDto, PlannedRecipeDto, RecipeDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { postMealPlan, postRecipe, deleteRecipe, postShoppingList, refresh, push } = vi.hoisted(
  () => ({
    postMealPlan: vi.fn(),
    postRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    postShoppingList: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
);

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'meal-plans': {
        $post: (...args: unknown[]) => postMealPlan(...args),
        ':id': {
          recipes: {
            $post: (...args: unknown[]) => postRecipe(...args),
            ':plannedRecipeId': {
              $delete: (...args: unknown[]) => deleteRecipe(...args),
            },
          },
        },
      },
      'shopping-lists': {
        $post: (...args: unknown[]) => postShoppingList(...args),
      },
    },
  },
}));

import { MealPlanClient } from './meal-plan-client';

function createRecipeDto(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '肉じゃが',
    baseServings: 2,
    servings: null,
    cookingTime: 30,
    tags: [],
    notes: '',
    ingredients: [],
    steps: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createPlannedRecipeDto(overrides: Partial<PlannedRecipeDto> = {}): PlannedRecipeDto {
  return {
    id: '959f4401-ef0f-4d1f-bc22-0912bce1147f',
    recipeId: '550e8400-e29b-41d4-a716-446655440000',
    scaleFactor: 1,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
    ...overrides,
  };
}

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

const CURRENT_WEEK = '2026-07-04';

describe('MealPlanClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('WC-M-01: 未作成の空状態が表示される', () => {
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    expect(screen.getByText('今週の献立はまだありません')).toBeDefined();
    expect(screen.getByRole('button', { name: '今週の献立をはじめる' })).toBeDefined();
  });

  it('WC-M-02: 作成ボタン押下で POST が呼ばれ、成功で router.refresh される', async () => {
    const user = userEvent.setup();
    postMealPlan.mockResolvedValue({ ok: true });
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    await user.click(screen.getByRole('button', { name: '今週の献立をはじめる' }));

    await waitFor(() => {
      expect(postMealPlan).toHaveBeenCalledWith({ json: { weekIdentifier: CURRENT_WEEK } });
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('WC-M-03: 作成失敗時に「操作に失敗しました。」を表示し refresh しない', async () => {
    const user = userEvent.setup();
    postMealPlan.mockResolvedValue({ ok: false });
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    await user.click(screen.getByRole('button', { name: '今週の献立をはじめる' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('WC-M-04: 通信エラー時に「通信エラーが発生しました。」を表示する', async () => {
    const user = userEvent.setup();
    postMealPlan.mockRejectedValue(new Error('network'));
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    await user.click(screen.getByRole('button', { name: '今週の献立をはじめる' }));

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('WC-M-05: 献立ありで週表示とレシピ名が表示される', () => {
    const mealPlan = createMealPlanDto({
      plannedRecipes: [createPlannedRecipeDto()],
    });
    render(
      <MealPlanClient
        mealPlan={mealPlan}
        recipes={[createRecipeDto()]}
        currentWeekIdentifier={CURRENT_WEEK}
      />,
    );

    expect(screen.getByText('7/4（土）〜7/10（金）')).toBeDefined();
    expect(screen.getByText('肉じゃが')).toBeDefined();
  });

  it('WC-M-06: レシピ 0 件のとき空状態文言が表示される', () => {
    const mealPlan = createMealPlanDto({ plannedRecipes: [] });
    render(
      <MealPlanClient mealPlan={mealPlan} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />,
    );

    expect(screen.getByText('レシピがまだ追加されていません')).toBeDefined();
  });

  it('WC-M-07: 名前解決できないレシピは「削除済みレシピ」表示になる', () => {
    const mealPlan = createMealPlanDto({
      plannedRecipes: [createPlannedRecipeDto({ recipeId: 'unknown-id' })],
    });
    render(
      <MealPlanClient
        mealPlan={mealPlan}
        recipes={[createRecipeDto()]}
        currentWeekIdentifier={CURRENT_WEEK}
      />,
    );

    expect(screen.getByText('削除済みレシピ')).toBeDefined();
  });

  it('WC-M-08: レシピ追加で POST が呼ばれ、成功で refresh される', async () => {
    const user = userEvent.setup();
    postRecipe.mockResolvedValue({ ok: true });
    const mealPlan = createMealPlanDto({ plannedRecipes: [] });
    render(
      <MealPlanClient
        mealPlan={mealPlan}
        recipes={[createRecipeDto()]}
        currentWeekIdentifier={CURRENT_WEEK}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'レシピを追加' }));
    await user.click(screen.getByRole('button', { name: '肉じゃが' }));
    await user.click(screen.getByRole('button', { name: '献立に追加' }));

    await waitFor(() => {
      expect(postRecipe).toHaveBeenCalledWith({
        param: { id: mealPlan.id },
        json: { recipeId: createRecipeDto().id, scaleFactor: 1 },
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('WC-M-09: 削除ボタンで DELETE が呼ばれ、成功で refresh される', async () => {
    const user = userEvent.setup();
    deleteRecipe.mockResolvedValue({ ok: true });
    const plannedRecipe = createPlannedRecipeDto();
    const mealPlan = createMealPlanDto({ plannedRecipes: [plannedRecipe] });
    render(
      <MealPlanClient
        mealPlan={mealPlan}
        recipes={[createRecipeDto()]}
        currentWeekIdentifier={CURRENT_WEEK}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立から削除' }));

    await waitFor(() => {
      expect(deleteRecipe).toHaveBeenCalledWith({
        param: { id: mealPlan.id, plannedRecipeId: plannedRecipe.id },
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('WC-M-10: 送信中は作成ボタンが disabled になる', async () => {
    const user = userEvent.setup();
    let resolvePost: (value: { ok: boolean }) => void = () => {};
    postMealPlan.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    await user.click(screen.getByRole('button', { name: '今週の献立をはじめる' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '作成中' }).hasAttribute('disabled')).toBe(true);
    });

    resolvePost({ ok: true });
  });

  it('WC-M-11: ヘッダーの履歴リンクが正しい href を持つ', () => {
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    expect(screen.getByRole('link', { name: '履歴' }).getAttribute('href')).toBe(
      '/meal-plans/history',
    );
  });

  it('MC-02: mealPlan なしのとき買い物リスト CTA は表示されない', () => {
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    expect(screen.queryByRole('button', { name: '買い物リストを作る' })).toBeNull();
    expect(screen.queryByRole('button', { name: '買い物リストを開く' })).toBeNull();
  });

  it('MC-01/MC-03: mealPlan が draft のとき「買い物リストを作る」CTA が表示される', () => {
    const mealPlan = createMealPlanDto({ status: 'draft' });
    render(
      <MealPlanClient mealPlan={mealPlan} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />,
    );

    expect(screen.getByRole('button', { name: '買い物リストを作る' })).toBeDefined();
  });

  it('MC-04: mealPlan が draft 以外のとき「買い物リストを開く」CTA が表示される', () => {
    const mealPlan = createMealPlanDto({ status: 'shopping' });
    render(
      <MealPlanClient mealPlan={mealPlan} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />,
    );

    expect(screen.getByRole('button', { name: '買い物リストを開く' })).toBeDefined();
  });

  it('MC-05: CTA 押下で POST が呼ばれ、成功で router.push される', async () => {
    const user = userEvent.setup();
    const mealPlan = createMealPlanDto({ status: 'draft' });
    postShoppingList.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'shopping-list-1' }),
    });
    render(
      <MealPlanClient mealPlan={mealPlan} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />,
    );

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(postShoppingList).toHaveBeenCalledWith({ json: { mealPlanId: mealPlan.id } });
      expect(push).toHaveBeenCalledWith('/shopping-lists/shopping-list-1');
    });
  });

  it('MC-06: CTA 押下が失敗すると errorMessage が表示される', async () => {
    const user = userEvent.setup();
    const mealPlan = createMealPlanDto({ status: 'draft' });
    postShoppingList.mockResolvedValue({ ok: false });
    render(
      <MealPlanClient mealPlan={mealPlan} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />,
    );

    await user.click(screen.getByRole('button', { name: '買い物リストを作る' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('MN-02: ヘッダーの導線は履歴のみ（他はボトムナビへ移設）', () => {
    render(<MealPlanClient mealPlan={null} recipes={[]} currentWeekIdentifier={CURRENT_WEEK} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['履歴']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/meal-plans/history']);
  });
});
