import type { RecipeDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    vi.restoreAllMocks();
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

  it('RFF-03: 「手順を追加」で手順行が増え、削除ボタンで減る', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '手順を追加' }));
    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: '手順を削除' })[0]);
    expect(screen.getAllByLabelText(/手順 \d/)).toHaveLength(1);
  });

  it('RFF-04: 材料行のエラーメッセージが該当行にのみ表示される', () => {
    const value: RecipeFormValue = {
      ...createInitialRecipeFormValue(),
      ingredients: [
        { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
        { id: 'ingredient-1', displayName: '', amountText: '2個' },
      ],
    };
    const fieldErrors: RecipeFieldErrors = {
      ...emptyRecipeFieldErrors(),
      ingredients: { 'ingredient-1': '食材名を入力してください。' },
    };
    render(<Harness initialValue={value} fieldErrors={fieldErrors} />);

    expect(screen.getAllByText('食材名を入力してください。')).toHaveLength(1);
  });

  // happy-dom は getBoundingClientRect() が常に 0 を返すため、dnd-kit が要素の位置を測れず
  // 並べ替え先を決定できない（ポインタ・キーボードとも）。兄弟内の位置から縦に積んだ矩形を
  // 返すスタブを入れて計測だけを成立させ、並べ替えの結線をキーボード操作で検証する。
  const STUB_ROW_HEIGHT = 60;

  function stubVerticalRects(): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const parent = this.parentElement;
      const index = parent === null ? 0 : Array.prototype.indexOf.call(parent.children, this);
      const top = index * STUB_ROW_HEIGHT;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 300,
        bottom: top + STUB_ROW_HEIGHT,
        width: 300,
        height: STUB_ROW_HEIGHT,
        toJSON: () => ({}),
      } as DOMRect;
    });
  }

  // Space でつかむ → 矢印で移動 → Space で確定（dnd-kit の KeyboardSensor）。
  // dnd-kit は `event.key` ではなく `event.code` を見るため、user-event の物理キーコード記法
  // （角括弧）で送る必要がある。
  async function reorderWithKeyboard(handleName: string, key: '[ArrowDown]' | '[ArrowUp]') {
    const user = userEvent.setup();
    const handle = screen.getByRole('button', { name: handleName });
    handle.focus();
    await user.keyboard('[Space]');
    await user.keyboard(key);
    await user.keyboard('[Space]');
  }

  it('RFF-09: 材料行ごとに並べ替えハンドルが描画される', () => {
    render(
      <Harness
        initialValue={{
          ...createInitialRecipeFormValue(),
          ingredients: [
            { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
            { id: 'ingredient-1', displayName: '', amountText: '' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: '「玉ねぎ」を並べ替え' })).toBeDefined();
    // 食材名が空の行は位置で特定できる
    expect(screen.getByRole('button', { name: '2番目の材料を並べ替え' })).toBeDefined();
  });

  it('RFF-10: キーボード操作で材料を 1 つ下へ移動でき、入力値も一緒に移動する', async () => {
    stubVerticalRects();
    render(
      <Harness
        initialValue={{
          ...createInitialRecipeFormValue(),
          ingredients: [
            { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
            { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
          ],
        }}
      />,
    );

    await reorderWithKeyboard('「玉ねぎ」を並べ替え', '[ArrowDown]');

    const names = screen
      .getAllByLabelText('食材名')
      .map((input) => (input as HTMLInputElement).value);
    const amounts = screen
      .getAllByLabelText('分量')
      .map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual(['人参', '玉ねぎ']);
    expect(amounts).toEqual(['1本', '2個']);
  });

  it('RFF-11: 先頭の材料を上へ移動しても順序は変わらない', async () => {
    stubVerticalRects();
    render(
      <Harness
        initialValue={{
          ...createInitialRecipeFormValue(),
          ingredients: [
            { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
            { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
          ],
        }}
      />,
    );

    await reorderWithKeyboard('「玉ねぎ」を並べ替え', '[ArrowUp]');

    const names = screen
      .getAllByLabelText('食材名')
      .map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual(['玉ねぎ', '人参']);
  });

  it('RFF-12: 並べ替え後の順序がそのまま送信ボディの ingredients 順になる', () => {
    const value: RecipeFormValue = {
      ...createInitialRecipeFormValue(),
      name: '肉じゃが',
      ingredients: [
        { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
        { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
      ],
    };

    const result = buildRecipeFormBody(value);

    expect(result.input?.ingredients.map((row) => row.displayName)).toEqual(['人参', '玉ねぎ']);
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
      { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
      { id: 'ingredient-1', displayName: '塩', amountText: '適量' },
      { id: 'ingredient-2', displayName: '水', amountText: '' },
    ]);
    expect(value.steps).toEqual([{ id: 'step-0', description: '煮る' }]);
  });
});
