import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { postRecipe, refresh, push, replace } = vi.hoisted(() => ({
  postRecipe: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace }),
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
    // 未保存ガードの sentinel を遷移先で置き換えるため、保存成功時は replace になる
    expect(replace).toHaveBeenCalledWith('/recipes');
    expect(refresh).toHaveBeenCalled();
  });

  it('RFC-06: 未編集でキャンセルすると確認ダイアログを出さずに遷移する', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect(push).toHaveBeenCalledWith('/recipes');
  });

  it('RFC-07: 編集後にキャンセルすると確認ダイアログが出て遷移しない', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);
    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('本当に戻りますか？')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('RFC-08: 確認ダイアログの「編集を続ける」で入力が残り遷移しない', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);
    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    await user.click(screen.getByRole('button', { name: '編集を続ける' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect((screen.getByLabelText(/レシピ名/) as HTMLInputElement).value).toBe('肉じゃが');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('RFC-09: 確認ダイアログの「戻る」で離脱する', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);
    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(replace).toHaveBeenCalledWith('/recipes');
  });

  it('RFC-10: 編集して元に戻すと確認ダイアログが出ない', async () => {
    const user = userEvent.setup();
    render(<RecipeFormClient />);
    const nameInput = screen.getByLabelText(/レシピ名/);
    await user.type(nameInput, '肉じゃが');
    await user.clear(nameInput);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    // 一度 dirty になった時点で積んだ sentinel は履歴に残るため、遷移は replace で潰す。
    expect(replace).toHaveBeenCalledWith('/recipes');
  });

  it('RFC-11: 保存成功後は確認ダイアログを出さずに遷移する', async () => {
    const user = userEvent.setup();
    postRecipe.mockResolvedValue({ ok: true });
    render(<RecipeFormClient />);
    await user.type(screen.getByLabelText(/レシピ名/), '肉じゃが');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/recipes');
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
    expect(replace).not.toHaveBeenCalled();
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
