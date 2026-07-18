import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeListClient } from './recipe-list-client';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function createRecipeDto(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '肉じゃが',
    baseServings: 2,
    servings: null,
    cookingTime: 30,
    tags: ['主菜'],
    notes: '',
    ingredients: [],
    steps: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const RECIPES = [
  createRecipeDto(),
  createRecipeDto({
    id: '959f4401-ef0f-4d1f-bc22-0912bce1147f',
    name: 'ほうれん草のおひたし',
    tags: ['副菜'],
  }),
];

describe('RecipeListClient', () => {
  afterEach(() => {
    cleanup();
  });

  it('RLC-01: 0 件のとき「まだレシピがありません」が表示される', () => {
    render(<RecipeListClient initialRecipes={[]} />);

    expect(screen.getByText(/まだレシピがありません/)).toBeDefined();
  });

  it('RLC-02: 検索とタグで絞り込まれ、全滅時は「該当するレシピがありません」', async () => {
    const user = userEvent.setup();
    render(<RecipeListClient initialRecipes={RECIPES} />);

    expect(screen.getByText('肉じゃが')).toBeDefined();
    expect(screen.getByText('ほうれん草のおひたし')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '副菜' }));
    expect(screen.queryByText('肉じゃが')).toBeNull();
    expect(screen.getByText('ほうれん草のおひたし')).toBeDefined();

    await user.type(screen.getByLabelText('レシピを検索'), '肉じゃが');
    expect(screen.queryByText('ほうれん草のおひたし')).toBeNull();
    expect(screen.getByText('該当するレシピがありません')).toBeDefined();
  });
});
