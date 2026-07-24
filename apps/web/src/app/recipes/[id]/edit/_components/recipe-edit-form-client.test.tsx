import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { putRecipe, refresh, push } = vi.hoisted(() => ({
  putRecipe: vi.fn(),
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
          $put: (...args: unknown[]) => putRecipe(...args),
        },
      },
    },
  },
}));

import { RecipeEditFormClient } from './recipe-edit-form-client';

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
    ],
    steps: [{ description: '煮る' }],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecipeEditFormClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('REF-01: DTO の初期値がフォームに反映される', () => {
    render(<RecipeEditFormClient recipe={createRecipeDto()} />);

    expect((screen.getByLabelText(/レシピ名/) as HTMLInputElement).value).toBe('肉じゃが');
    expect(screen.getByRole('button', { name: '主菜' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText(/調理時間/) as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('食材名') as HTMLInputElement).value).toBe('玉ねぎ');
    expect((screen.getByLabelText('分量') as HTMLInputElement).value).toBe('2個');
    expect((screen.getByLabelText('手順 1') as HTMLTextAreaElement).value).toBe('煮る');
    expect((screen.getByLabelText(/メモ/) as HTMLTextAreaElement).value).toBe('作り置き用');
  });

  it('REF-02: 基準人数は読み取り専用表示で入力欄が存在しない', () => {
    render(<RecipeEditFormClient recipe={createRecipeDto()} />);

    expect(screen.getByText('2人分')).toBeDefined();
    expect(screen.getByText('（作成後は変更できません）')).toBeDefined();
    expect(screen.queryByLabelText('基準人数')).toBeNull();
  });

  it('REF-03: 送信で PUT /api/recipes/:id に現行形の JSON が渡り詳細ページへ遷移する', async () => {
    const user = userEvent.setup();
    putRecipe.mockResolvedValue({ ok: true });
    const recipe = createRecipeDto();
    render(<RecipeEditFormClient recipe={recipe} />);

    await user.clear(screen.getByLabelText(/レシピ名/));
    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが改');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(putRecipe).toHaveBeenCalledWith({
      param: { id: recipe.id },
      json: {
        name: '肉じゃが改',
        tags: ['主菜'],
        cookingTime: 30,
        notes: '作り置き用',
        ingredients: [
          {
            productRef: null,
            displayName: '玉ねぎ',
            amountValue: 2,
            amountUnit: '個',
            amountNote: null,
          },
        ],
        steps: [{ description: '煮る' }],
      },
    });
    expect(push).toHaveBeenCalledWith(`/recipes/${recipe.id}`);
    expect(refresh).toHaveBeenCalled();
  });

  it('REF-04: API が失敗レスポンスのときエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    putRecipe.mockResolvedValue({ ok: false });
    render(<RecipeEditFormClient recipe={createRecipeDto()} />);

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('保存に失敗しました。')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
