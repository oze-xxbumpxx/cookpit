import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { deleteRecipe, refresh, push } = vi.hoisted(() => ({
  deleteRecipe: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      recipes: {
        ':id': {
          $delete: (...args: unknown[]) => deleteRecipe(...args),
        },
      },
    },
  },
}));

import { RecipeDetailClient } from './recipe-detail-client';

function createRecipeDto(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '肉じゃが',
    baseServings: 2,
    servings: null,
    cookingTime: 30,
    tags: ['主菜'],
    notes: '作り置き用',
    ingredients: [
      {
        productRef: null,
        displayName: '玉ねぎ',
        amountValue: 2,
        amountUnit: '個',
        amountNote: null,
      },
      {
        productRef: null,
        displayName: '塩',
        amountValue: null,
        amountUnit: null,
        amountNote: '適量',
      },
    ],
    steps: [{ description: '切る' }, { description: '煮る' }],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecipeDetailClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('RDC-01: レシピ名・調理時間・基準人数・材料・手順・メモが表示される', () => {
    render(<RecipeDetailClient recipe={createRecipeDto()} />);

    expect(screen.getByRole('heading', { name: '肉じゃが' })).toBeDefined();
    expect(screen.getByText('30分')).toBeDefined();
    // 基準人数カードと材料見出しの 2 箇所に「2人分」が表示される
    expect(screen.getAllByText('2人分')).toHaveLength(2);
    expect(screen.getByText('玉ねぎ')).toBeDefined();
    expect(screen.getByText('適量')).toBeDefined();
    expect(screen.getByText('煮る')).toBeDefined();
    expect(screen.getByText('作り置き用')).toBeDefined();
  });

  it('RDC-01b: 倍量切り替えで材料の数値と人数表示がスケールされる', async () => {
    const user = userEvent.setup();
    render(<RecipeDetailClient recipe={createRecipeDto()} />);

    await user.click(screen.getByRole('button', { name: '2×' }));

    expect(screen.getByText('4人分')).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('適量')).toBeDefined();
  });

  it('RDC-02: 削除確定で DELETE /api/recipes/:id が呼ばれ /recipes へ遷移する', async () => {
    const user = userEvent.setup();
    deleteRecipe.mockResolvedValue({ ok: true });
    const recipe = createRecipeDto();
    render(<RecipeDetailClient recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'このレシピを削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(deleteRecipe).toHaveBeenCalledWith({ param: { id: recipe.id } });
      expect(push).toHaveBeenCalledWith('/recipes');
      expect(refresh).toHaveBeenCalled();
    });
  });
});
