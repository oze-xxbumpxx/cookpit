import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { postRecipe, refresh, push } = vi.hoisted(() => ({
  postRecipe: vi.fn(),
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
        $post: (...args: unknown[]) => postRecipe(...args),
      },
    },
  },
}));

import { RecipeFormClient } from './recipe-form-client';

describe('RecipeFormClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('RFC-01: レシピ名未入力では保存ボタンが disabled', () => {
    render(<RecipeFormClient />);

    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true);
  });

  it('RFC-02: 送信で POST /api/recipes に現行形の JSON が渡り /recipes へ遷移する', async () => {
    const user = userEvent.setup();
    postRecipe.mockResolvedValue({ ok: true });
    render(<RecipeFormClient />);

    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    await user.click(screen.getByRole('button', { name: '主菜' }));
    await user.type(screen.getByLabelText('食材名'), '玉ねぎ');
    await user.type(screen.getByLabelText('分量'), '2個');
    await user.type(screen.getByLabelText('手順 1'), '煮る');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(postRecipe).toHaveBeenCalledWith({
      json: {
        name: '肉じゃが',
        tags: ['主菜'],
        baseServings: 2,
        cookingTime: null,
        notes: '',
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
    expect(push).toHaveBeenCalledWith('/recipes');
    expect(refresh).toHaveBeenCalled();
  });

  it('RFC-03: 基準人数 0 では native min 制約により送信がブロックされ POST されない', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);

    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    // number input は選択 API を持たず user.clear が使えないため fireEvent で値を置換する
    fireEvent.input(screen.getByLabelText(/基準人数/), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(postRecipe).not.toHaveBeenCalled();
  });

  it('RFC-04: API が失敗レスポンスのときエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    postRecipe.mockResolvedValue({ ok: false });
    render(<RecipeFormClient />);

    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('保存に失敗しました。入力内容を確認してください。')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('RFC-05: 通信例外のとき通信エラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    postRecipe.mockRejectedValue(new Error('network'));
    render(<RecipeFormClient />);

    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
  });
});
