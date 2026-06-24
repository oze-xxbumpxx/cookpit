import { describe, expect, it } from 'vitest';
import { Quantity } from '../shared/quantity';
import { CookingStep } from './cooking-step';
import { RecipeId } from './recipe-id';
import { RecipeIngredient } from './recipe-ingredient';
import { Recipe } from './recipe';
import type { RecipeProps } from './recipe';

const buildIngredient = (): RecipeIngredient =>
  RecipeIngredient.create({
    productRef: null,
    displayName: '玉ねぎ',
    amount: Quantity.of(100, 'g'),
    amountNote: null,
  });

describe('Recipe.create', () => {
  it('最小入力で生成しデフォルトを適用する (R1)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(recipe.name).toBe('肉じゃが');
    expect(recipe.baseServings).toBe(2);
    expect(recipe.tags).toEqual([]);
    expect(recipe.notes).toBe('');
    expect(recipe.cookingTime).toBeNull();
    expect(recipe.id.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('名前が空白なら拒否する (R2)', () => {
    expect(() =>
      Recipe.create({ name: '  ', ingredients: [], steps: [], baseServings: 2 }),
    ).toThrow('Recipe name is required');
  });

  it('baseServings が 0 なら拒否する (R3)', () => {
    expect(() =>
      Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 0 }),
    ).toThrow('Recipe base servings must be positive');
  });

  it('baseServings が負なら拒否する (R4)', () => {
    expect(() =>
      Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: -1 }),
    ).toThrow('Recipe base servings must be positive');
  });

  it('cookingTime が負なら拒否する (R5)', () => {
    expect(() =>
      Recipe.create({
        name: '肉じゃが',
        ingredients: [],
        steps: [],
        baseServings: 2,
        cookingTime: -1,
      }),
    ).toThrow('Recipe cooking time must be non-negative');
  });

  it('cookingTime が 0 は許容する（現状仕様として固定） (R6)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      cookingTime: 0,
    });
    expect(recipe.cookingTime).toBe(0);
  });
});

describe('Recipe の状態変更', () => {
  it('rename が空白を拒否する (R7)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.rename('  ')).toThrow('Recipe name is required');
  });

  it('updateCookingTime が負を拒否する (R8)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.updateCookingTime(-1)).toThrow('Recipe cooking time must be non-negative');
  });

  it('updateCookingTime(null) は null を設定する (R9)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      cookingTime: 30,
    });
    recipe.updateCookingTime(null);
    expect(recipe.cookingTime).toBeNull();
  });

  it('scaleIngredients は各 ingredient へ委譲する (R10)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [buildIngredient()],
      steps: [new CookingStep('煮る')],
      baseServings: 2,
    });
    const scaled = recipe.scaleIngredients(2);
    expect(scaled[0]?.amount?.value).toBe(200);
  });

  it('ゲッターは防御的コピーを返し内部状態を保護する (R11)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    recipe.tags.push('主菜');
    expect(recipe.tags).toEqual([]);
  });
});

describe('Recipe.reconstruct', () => {
  it('props の値を保持して復元する (R12)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const props: RecipeProps = {
      id: RecipeId.fromString('fixed-id'),
      name: '肉じゃが',
      ingredients: [buildIngredient()],
      steps: [new CookingStep('煮る')],
      baseServings: 4,
      tags: ['主菜'],
      cookingTime: 30,
      notes: 'メモ',
      createdAt,
      updatedAt,
    };
    const recipe = Recipe.reconstruct(props);
    expect(recipe.id.value).toBe('fixed-id');
    expect(recipe.baseServings).toBe(4);
    expect(recipe.tags).toEqual(['主菜']);
    expect(recipe.cookingTime).toBe(30);
    expect(recipe.createdAt.toISOString()).toBe(createdAt.toISOString());
  });
});
