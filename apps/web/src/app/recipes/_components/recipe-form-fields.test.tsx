import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RecipeFormFields,
  buildRecipeFormBody,
  createInitialRecipeFormValue,
  emptyRecipeFieldErrors,
  toRecipeFormValue,
  type RecipeFieldErrors,
  type RecipeFormValue,
} from './recipe-form-fields';

function createRecipeDto(overrides: Partial<RecipeDto> = {}): RecipeDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '肉じゃが',
    baseServings: 2,
    servings: null,
    cookingTime: 30,
    tags: ['主菜'],
    notes: 'メモ',
    ingredients: [],
    steps: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function Harness({
  initialValue,
  fieldErrors,
}: {
  initialValue?: RecipeFormValue;
  fieldErrors?: RecipeFieldErrors;
}) {
  const [value, setValue] = useState(initialValue ?? createInitialRecipeFormValue());
  return (
    <RecipeFormFields
      value={value}
      fieldErrors={fieldErrors ?? emptyRecipeFieldErrors()}
      onChange={setValue}
      baseServingsSlot={<div data-testid="base-servings-slot" />}
    />
  );
}

describe('RecipeFormFields', () => {
  afterEach(() => {
    cleanup();
  });

  it('RFF-01: タグチップのクリックで選択され、再クリックで解除される', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const chip = screen.getByRole('button', { name: '主菜' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('RFF-02: 「材料を追加」で材料行が増え、削除ボタンで減る', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByLabelText('食材名')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '材料を追加' }));
    expect(screen.getAllByLabelText('食材名')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: '材料を削除' })[0]);
    expect(screen.getAllByLabelText('食材名')).toHaveLength(1);
  });

  it('RFF-03: 「ステップを追加」で手順行が増え、削除ボタンで減る', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'ステップを追加' }));
    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: '手順を削除' })[0]);
    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(1);
  });

  it('RFF-04: 材料行のエラーメッセージが該当行にのみ表示される', () => {
    const value: RecipeFormValue = {
      ...createInitialRecipeFormValue(),
      ingredients: [
        { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2', amountUnit: '個' },
        { id: 'ingredient-1', displayName: '', amountText: '2', amountUnit: '個' },
      ],
    };
    const fieldErrors: RecipeFieldErrors = {
      ...emptyRecipeFieldErrors(),
      ingredients: { 'ingredient-1': '食材名を入力してください。' },
    };
    render(<Harness initialValue={value} fieldErrors={fieldErrors} />);

    expect(screen.getAllByText('食材名を入力してください。')).toHaveLength(1);
  });

  it('RFF-05: baseServingsSlot に渡した要素が描画される', () => {
    render(<Harness />);

    expect(screen.getByTestId('base-servings-slot')).toBeDefined();
  });
});

describe('buildRecipeFormBody', () => {
  it('RFF-06: 調理時間が負数・小数はエラー、空文字は null になる', () => {
    const base = createInitialRecipeFormValue();

    const negative = buildRecipeFormBody({ ...base, name: 'テスト', cookingTime: '-5' });
    expect(negative.input).toBeNull();
    expect(negative.errors.cookingTime).toBe('調理時間は0以上の整数で入力してください。');

    const decimal = buildRecipeFormBody({ ...base, name: 'テスト', cookingTime: '2.5' });
    expect(decimal.input).toBeNull();
    expect(decimal.errors.cookingTime).toBe('調理時間は0以上の整数で入力してください。');

    const empty = buildRecipeFormBody({ ...base, name: 'テスト', cookingTime: '' });
    expect(empty.input?.cookingTime).toBeNull();
  });

  it('RFF-07: 空ステップは除外され description は trim される', () => {
    const value: RecipeFormValue = {
      ...createInitialRecipeFormValue(),
      name: ' テスト ',
      steps: [
        { id: 'step-0', description: ' 切る ' },
        { id: 'step-1', description: '   ' },
      ],
    };

    const result = buildRecipeFormBody(value);

    expect(result.input).toEqual({
      name: 'テスト',
      tags: [],
      cookingTime: null,
      notes: '',
      ingredients: [],
      steps: [{ description: '切る' }],
    });
  });
});

describe('toRecipeFormValue', () => {
  it('RFF-08: amountValue あり / amountNote のみ / 両方 null の材料を行に変換する', () => {
    const recipe = createRecipeDto({
      cookingTime: null,
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
        {
          productRef: null,
          displayName: '水',
          amountValue: null,
          amountUnit: null,
          amountNote: null,
        },
      ],
      steps: [{ description: '煮る' }],
    });

    const value = toRecipeFormValue(recipe);

    expect(value.name).toBe('肉じゃが');
    expect(value.tags).toEqual(['主菜']);
    expect(value.cookingTime).toBe('');
    expect(value.notes).toBe('メモ');
    expect(value.ingredients).toEqual([
      { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2', amountUnit: '個' },
      { id: 'ingredient-1', displayName: '塩', amountText: '適量', amountUnit: '' },
      { id: 'ingredient-2', displayName: '水', amountText: '', amountUnit: '' },
    ]);
    expect(value.steps).toEqual([{ id: 'step-0', description: '煮る' }]);
  });
});
