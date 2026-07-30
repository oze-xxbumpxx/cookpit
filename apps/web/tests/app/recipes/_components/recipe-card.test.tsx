import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeCard } from '../../../../src/app/recipes/_components/recipe-card';

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
    tags: ['主菜', '作り置き向き', '冷凍可', '副菜'],
    notes: '',
    ingredients: [],
    steps: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecipeCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('RC-01: 名前・調理時間・タグ最大 3 件が表示され、cookingTime null は非表示', () => {
    render(<RecipeCard recipe={createRecipeDto()} />);

    expect(screen.getByText('肉じゃが')).toBeDefined();
    expect(screen.getByText('調理時間 30分')).toBeDefined();
    expect(screen.getByText('主菜')).toBeDefined();
    expect(screen.getByText('作り置き向き')).toBeDefined();
    expect(screen.getByText('冷凍可')).toBeDefined();
    expect(screen.queryByText('副菜')).toBeNull();

    cleanup();
    render(<RecipeCard recipe={createRecipeDto({ cookingTime: null, tags: [] })} />);
    expect(screen.queryByText(/調理時間/)).toBeNull();
  });

  it('RC-02: 詳細ページへのリンク href が正しい', () => {
    const recipe = createRecipeDto();
    render(<RecipeCard recipe={recipe} />);

    expect(
      screen.getByRole('link', { name: `${recipe.name}の詳細を見る` }).getAttribute('href'),
    ).toBe(`/recipes/${recipe.id}`);
  });
});
