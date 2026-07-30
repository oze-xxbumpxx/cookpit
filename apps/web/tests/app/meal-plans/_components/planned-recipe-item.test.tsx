import type { PlannedRecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlannedRecipeItem } from '../../../../src/app/meal-plans/_components/planned-recipe-item';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

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

describe('PlannedRecipeItem', () => {
  afterEach(() => {
    cleanup();
  });

  it('WC-I-01: 名前解決ありなら名前とリンクが表示される', () => {
    const plannedRecipe = createPlannedRecipeDto();
    render(
      <PlannedRecipeItem
        plannedRecipe={plannedRecipe}
        recipeName="肉じゃが"
        onRemove={vi.fn()}
        submitting={false}
        canEdit={true}
      />,
    );

    const link = screen.getByRole('link', { name: '肉じゃが' });
    expect(link.getAttribute('href')).toBe(`/recipes/${plannedRecipe.recipeId}`);
  });

  it('WC-I-02: 名前解決なしなら「削除済みレシピ」表示でリンクなし', () => {
    render(
      <PlannedRecipeItem
        plannedRecipe={createPlannedRecipeDto()}
        recipeName={null}
        onRemove={vi.fn()}
        submitting={false}
        canEdit={true}
      />,
    );

    expect(screen.getByText('削除済みレシピ')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('WC-I-03: 削除ボタン押下で onRemove(plannedRecipe.id) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const plannedRecipe = createPlannedRecipeDto();
    render(
      <PlannedRecipeItem
        plannedRecipe={plannedRecipe}
        recipeName="肉じゃが"
        onRemove={onRemove}
        submitting={false}
        canEdit={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: '献立から削除' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(plannedRecipe.id);
  });

  it('WC-I-04: 削除済みレシピでも削除ボタンは有効', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <PlannedRecipeItem
        plannedRecipe={createPlannedRecipeDto()}
        recipeName={null}
        onRemove={onRemove}
        submitting={false}
        canEdit={true}
      />,
    );

    const button = screen.getByRole('button', { name: '献立から削除' });
    expect(button.hasAttribute('disabled')).toBe(false);
    await user.click(button);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('WC-I-05: 送信中は削除ボタンが disabled', () => {
    render(
      <PlannedRecipeItem
        plannedRecipe={createPlannedRecipeDto()}
        recipeName="肉じゃが"
        onRemove={vi.fn()}
        submitting={true}
        canEdit={true}
      />,
    );

    expect(screen.getByRole('button', { name: '献立から削除' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('WC-I-06: 倍量が表示される', () => {
    render(
      <PlannedRecipeItem
        plannedRecipe={createPlannedRecipeDto({ scaleFactor: 1.5 })}
        recipeName="肉じゃが"
        onRemove={vi.fn()}
        submitting={false}
        canEdit={true}
      />,
    );

    expect(screen.getByText('1.5×')).toBeDefined();
  });

  it('WC-I-07: canEdit=false のとき削除ボタンを表示しない', () => {
    render(
      <PlannedRecipeItem
        plannedRecipe={createPlannedRecipeDto()}
        recipeName="肉じゃが"
        onRemove={vi.fn()}
        submitting={false}
        canEdit={false}
      />,
    );

    expect(screen.queryByRole('button', { name: '献立から削除' })).toBeNull();
    // レシピ名は引き続き表示される（閲覧は可能）
    expect(screen.getByRole('link', { name: '肉じゃが' })).toBeDefined();
  });
});
