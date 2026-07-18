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
  it('cookingTime を null 明示指定すると null が設定される (R-GAP-2)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      cookingTime: null,
    });
    expect(recipe.cookingTime).toBeNull();
  });

  it('最小入力で生成しデフォルトを適用する (R1)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(recipe.name).toBe('肉じゃが');
    expect(recipe.baseServings).toBe(2);
    expect(recipe.tags).toEqual([]);
    expect(recipe.notes).toBe('');
    expect(recipe.cookingTime).toBeNull();
    expect(recipe.id.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('名前が空文字なら拒否する (R-GAP-1)', () => {
    expect(() => Recipe.create({ name: '', ingredients: [], steps: [], baseServings: 2 })).toThrow(
      'Recipe name is required',
    );
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

  // T-D01
  it('servings: 4 で生成すると servings === 4 になる (T-D01)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: 4,
    });
    expect(recipe.servings).toBe(4);
  });

  // T-D07: 最小有効値
  it('servings: 1（最小有効値）で生成すると servings === 1 になる (T-D07)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: 1,
    });
    expect(recipe.servings).toBe(1);
  });

  // T-D02
  it('servings: null で生成すると servings === null になる (T-D02)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: null,
    });
    expect(recipe.servings).toBeNull();
  });

  // T-D03
  it('servings を省略すると servings === null になる (T-D03)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(recipe.servings).toBeNull();
  });

  // T-D04
  it('servings: 0 は拒否する (T-D04)', () => {
    expect(() =>
      Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2, servings: 0 }),
    ).toThrow('Recipe servings must be a positive integer');
  });

  // T-D05
  it('servings: -1 は拒否する (T-D05)', () => {
    expect(() =>
      Recipe.create({
        name: '肉じゃが',
        ingredients: [],
        steps: [],
        baseServings: 2,
        servings: -1,
      }),
    ).toThrow('Recipe servings must be a positive integer');
  });

  // T-D06
  it('servings: 1.5（非整数）は拒否する (T-D06)', () => {
    expect(() =>
      Recipe.create({
        name: '肉じゃが',
        ingredients: [],
        steps: [],
        baseServings: 2,
        servings: 1.5,
      }),
    ).toThrow('Recipe servings must be a positive integer');
  });
});

describe('Recipe の状態変更', () => {
  it('rename が空白を拒否する (R7)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.rename('  ')).toThrow('Recipe name is required');
  });

  it('rename で name が変わり updatedAt が進む (R-GAP-3)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    const before = recipe.updatedAt.getTime();
    recipe.rename('カレー');
    expect(recipe.name).toBe('カレー');
    expect(recipe.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('updateIngredients でリストが差し替わり updatedAt が進む (R-GAP-4)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    const before = recipe.updatedAt.getTime();
    recipe.updateIngredients([buildIngredient()]);
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('updateSteps でリストが差し替わる (R-GAP-5)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    recipe.updateSteps([new CookingStep('煮る'), new CookingStep('盛る')]);
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0]?.description).toBe('煮る');
  });

  it('updateTags で空配列へ変更できる (R-GAP-6)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      tags: ['主菜'],
    });
    recipe.updateTags([]);
    expect(recipe.tags).toEqual([]);
  });

  it('updateNotes でノートが更新される (R-GAP-7)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    recipe.updateNotes('新しいメモ');
    expect(recipe.notes).toBe('新しいメモ');
  });

  it('updateCookingTime が負を拒否する (R8)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.updateCookingTime(-1)).toThrow('Recipe cooking time must be non-negative');
  });

  it('updateCookingTime(0) は許容する (R-GAP-8)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      cookingTime: 30,
    });
    recipe.updateCookingTime(0);
    expect(recipe.cookingTime).toBe(0);
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

  it('scaleIngredients — 食材が空のとき空配列を返す (R-GAP-9)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(recipe.scaleIngredients(2)).toEqual([]);
  });

  it('tags ゲッターは防御的コピーを返し内部状態を保護する (R11)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    recipe.tags.push('主菜');
    expect(recipe.tags).toEqual([]);
  });

  it('ingredients ゲッターは防御的コピーを返し内部状態を保護する (R-GAP-11a)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [buildIngredient()],
      steps: [],
      baseServings: 2,
    });
    recipe.ingredients.pop();
    expect(recipe.ingredients).toHaveLength(1);
  });

  it('steps ゲッターは防御的コピーを返し内部状態を保護する (R-GAP-11b)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [new CookingStep('煮る')],
      baseServings: 2,
    });
    recipe.steps.pop();
    expect(recipe.steps).toHaveLength(1);
  });

  // T-D08
  it('updateServings(2) で servings === 2 かつ updatedAt が進む (T-D08)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: 4,
    });
    const before = recipe.updatedAt.getTime();
    recipe.updateServings(2);
    expect(recipe.servings).toBe(2);
    expect(recipe.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  // T-D13: 最小有効値
  it('updateServings(1)（最小有効値）で servings === 1 になる (T-D13)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    recipe.updateServings(1);
    expect(recipe.servings).toBe(1);
  });

  // T-D09
  it('updateServings(null) で servings === null になる (T-D09)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: 4,
    });
    recipe.updateServings(null);
    expect(recipe.servings).toBeNull();
  });

  // T-D10
  it('updateServings(0) は拒否する (T-D10)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.updateServings(0)).toThrow('Recipe servings must be a positive integer');
  });

  // T-D11
  it('updateServings(-5) は拒否する (T-D11)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.updateServings(-5)).toThrow('Recipe servings must be a positive integer');
  });

  // T-D12
  it('updateServings(1.5) は拒否する (T-D12)', () => {
    const recipe = Recipe.create({ name: '肉じゃが', ingredients: [], steps: [], baseServings: 2 });
    expect(() => recipe.updateServings(1.5)).toThrow('Recipe servings must be a positive integer');
  });

  // T-D08b: 失敗後も状態が汚染されない
  it('updateServings 失敗後も servings の値が変わらない (T-D08b)', () => {
    const recipe = Recipe.create({
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      servings: 4,
    });
    recipe.updateServings(2);
    expect(() => recipe.updateServings(0)).toThrow('Recipe servings must be a positive integer');
    expect(recipe.servings).toBe(2);
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
      servings: null,
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

  it('渡した createdAt/updatedAt を変更しても復元済みインスタンスに影響しない (R-GAP-10)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('fixed-id'),
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt,
      updatedAt,
    });
    createdAt.setFullYear(2099);
    updatedAt.setFullYear(2099);
    expect(recipe.createdAt.getFullYear()).toBe(2026);
    expect(recipe.updatedAt.getFullYear()).toBe(2026);
  });

  // T-D14
  it('reconstruct({ servings: 3 }) で servings === 3 になる (T-D14)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('fixed-id'),
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: 3,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(recipe.servings).toBe(3);
  });

  // T-D15
  it('reconstruct({ servings: null }) で servings === null になる (T-D15)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('fixed-id'),
      name: '肉じゃが',
      ingredients: [],
      steps: [],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(recipe.servings).toBeNull();
  });
});
