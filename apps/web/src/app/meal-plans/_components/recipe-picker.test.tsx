import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipePicker } from './recipe-picker';

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

const RECIPES = [
  createRecipeDto({ id: 'id-1', name: '肉じゃが' }),
  createRecipeDto({ id: 'id-2', name: 'カレー' }),
];

describe('RecipePicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('WC-K-01: 検索欄への入力で絞り込まれる', async () => {
    const user = userEvent.setup();
    render(<RecipePicker recipes={RECIPES} onAdd={vi.fn()} submitting={false} />);

    await user.type(screen.getByLabelText('レシピを検索'), 'カレー');

    expect(screen.getByText('カレー')).toBeDefined();
    expect(screen.queryByText('肉じゃが')).toBeNull();
  });

  it('WC-K-02: 未選択時は [献立に追加] が disabled', () => {
    render(<RecipePicker recipes={RECIPES} onAdd={vi.fn()} submitting={false} />);

    expect(screen.getByRole('button', { name: '献立に追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('WC-K-03: 倍量未選択でレシピのみ選択すると onAdd はデフォルト 1 で呼ばれる', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RecipePicker recipes={RECIPES} onAdd={onAdd} submitting={false} />);

    await user.click(screen.getByRole('button', { name: '肉じゃが' }));
    await user.click(screen.getByRole('button', { name: '献立に追加' }));

    expect(onAdd).toHaveBeenCalledWith('id-1', 1);
  });

  it('WC-K-04: 倍量プリセットを選択すると onAdd にその値が渡る', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RecipePicker recipes={RECIPES} onAdd={onAdd} submitting={false} />);

    await user.click(screen.getByRole('button', { name: '肉じゃが' }));
    await user.click(screen.getByRole('button', { name: '2×' }));
    await user.click(screen.getByRole('button', { name: '献立に追加' }));

    expect(onAdd).toHaveBeenCalledWith('id-1', 2);
  });

  it('WC-K-05: 追加後は選択レシピのみリセットされる（検索テキストは維持）', async () => {
    const user = userEvent.setup();
    render(<RecipePicker recipes={RECIPES} onAdd={vi.fn()} submitting={false} />);

    await user.type(screen.getByLabelText('レシピを検索'), '肉');
    await user.click(screen.getByRole('button', { name: '肉じゃが' }));
    await user.click(screen.getByRole('button', { name: '献立に追加' }));

    expect(screen.getByRole('button', { name: '献立に追加' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('レシピを検索')).toHaveProperty('value', '肉');
  });

  it('WC-K-06: 送信中は [献立に追加] が disabled', async () => {
    const user = userEvent.setup();
    render(<RecipePicker recipes={RECIPES} onAdd={vi.fn()} submitting={true} />);

    await user.click(screen.getByRole('button', { name: '肉じゃが' }));

    expect(screen.getByRole('button', { name: '献立に追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('WC-K-07: 検索結果 0 件で該当なし文言が表示される', async () => {
    const user = userEvent.setup();
    render(<RecipePicker recipes={RECIPES} onAdd={vi.fn()} submitting={false} />);

    await user.type(screen.getByLabelText('レシピを検索'), '存在しない');

    expect(screen.getByText('該当するレシピがありません')).toBeDefined();
  });
});
