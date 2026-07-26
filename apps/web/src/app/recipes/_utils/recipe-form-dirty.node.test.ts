import { describe, expect, it } from 'vitest';
import type { RecipeFormValue } from '@/app/recipes/_components/recipe-form-fields';
import { isRecipeFormDirty, type RecipeFormSnapshot } from './recipe-form-dirty';

function createValue(overrides: Partial<RecipeFormValue> = {}): RecipeFormValue {
  return {
    name: '肉じゃが',
    tags: ['主菜'],
    cookingTime: '30',
    ingredients: [
      { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
      { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
    ],
    steps: [{ id: 'step-0', description: '切る' }],
    notes: 'メモ',
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<RecipeFormValue> = {},
  baseServings = '2',
): RecipeFormSnapshot {
  return { value: createValue(overrides), baseServings };
}

const INITIAL = snapshot();

describe('isRecipeFormDirty', () => {
  it('RFD-01: 初期値と同一なら false', () => {
    expect(isRecipeFormDirty(INITIAL, snapshot())).toBe(false);
  });

  it('RFD-02: name / cookingTime / notes の変更を検出する', () => {
    expect(isRecipeFormDirty(INITIAL, snapshot({ name: 'カレー' }))).toBe(true);
    expect(isRecipeFormDirty(INITIAL, snapshot({ cookingTime: '45' }))).toBe(true);
  });

  it('RFD-03: baseServings の変更を検出する', () => {
    expect(isRecipeFormDirty(INITIAL, snapshot({}, '4'))).toBe(true);
  });

  it('RFD-04: 材料の内容の変更を検出する', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({
          ingredients: [
            { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '3個' },
            { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('RFD-05: 材料の並べ替えを変更として検出する', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({
          ingredients: [
            { id: 'ingredient-1', displayName: '人参', amountText: '1本' },
            { id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('RFD-06: 空の材料行を追加しただけでは false', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({
          ingredients: [
            ...createValue().ingredients,
            { id: 'ingredient-2', displayName: '', amountText: '' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('RFD-07: 材料の削除を検出する', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({
          ingredients: [{ id: 'ingredient-0', displayName: '玉ねぎ', amountText: '2個' }],
        }),
      ),
    ).toBe(true);
  });

  it('RFD-08: 空の手順行を追加しただけでは false、入力すると true', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({ steps: [...createValue().steps, { id: 'step-1', description: '  ' }] }),
      ),
    ).toBe(false);
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({ steps: [...createValue().steps, { id: 'step-1', description: '煮る' }] }),
      ),
    ).toBe(true);
  });

  it('RFD-09: タグを付けて外すと false、追加すると true', () => {
    expect(isRecipeFormDirty(INITIAL, snapshot({ tags: ['主菜'] }))).toBe(false);
    expect(isRecipeFormDirty(INITIAL, snapshot({ tags: ['主菜', '副菜'] }))).toBe(true);
  });

  it('RFD-10: タグの選択順の差は変更と見なさない', () => {
    const initial = snapshot({ tags: ['主菜', '副菜'] });
    expect(isRecipeFormDirty(initial, snapshot({ tags: ['副菜', '主菜'] }))).toBe(false);
  });

  it('RFD-11: 前後の空白だけの差は変更と見なさない', () => {
    expect(isRecipeFormDirty(INITIAL, snapshot({ name: ' 肉じゃが ' }))).toBe(false);
    expect(isRecipeFormDirty(INITIAL, snapshot({ cookingTime: ' 30 ' }))).toBe(false);
    expect(isRecipeFormDirty(INITIAL, snapshot({}, ' 2 '))).toBe(false);
  });

  it('RFD-12: 変更して元に戻すと false に戻る', () => {
    const changed = snapshot({ name: 'カレー' });
    expect(isRecipeFormDirty(INITIAL, changed)).toBe(true);
    expect(isRecipeFormDirty(INITIAL, snapshot({ name: '肉じゃが' }))).toBe(false);
  });

  it('RFD-13: 行の id だけが違っても変更と見なさない', () => {
    expect(
      isRecipeFormDirty(
        INITIAL,
        snapshot({
          ingredients: [
            { id: 'ingredient-9', displayName: '玉ねぎ', amountText: '2個' },
            { id: 'ingredient-8', displayName: '人参', amountText: '1本' },
          ],
        }),
      ),
    ).toBe(false);
  });
});
