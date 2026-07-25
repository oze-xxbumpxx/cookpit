import { describe, expect, it } from 'vitest';
import { CookingStep, Quantity, Recipe, RecipeId, RecipeIngredient } from '@cookpit/domain';
import { toIngredient, toStep, toRecipeDto } from './recipe.mapper';
import type { RecipeIngredientDto, CookingStepDto } from './recipe.dto';

describe('toStep', () => {
  it('CookingStepDto を CookingStep に変換する (M1)', () => {
    const dto: CookingStepDto = { description: '野菜を切る' };
    const step = toStep(dto);
    expect(step).toBeInstanceOf(CookingStep);
    expect(step.description).toBe('野菜を切る');
  });

  it('空の description は CookingStep のバリデーションで拒否される (M2)', () => {
    expect(() => toStep({ description: '' })).toThrow('Description is required');
  });
});

describe('toIngredient', () => {
  it('amount 指定の DTO を RecipeIngredient に変換する (M3)', () => {
    const dto: RecipeIngredientDto = {
      productRef: null,
      displayName: '玉ねぎ',
      amountValue: 100,
      amountUnit: 'g',
      amountNote: null,
    };
    const ingredient = toIngredient(dto);
    expect(ingredient).toBeInstanceOf(RecipeIngredient);
    expect(ingredient.displayName).toBe('玉ねぎ');
    expect(ingredient.amount?.value).toBe(100);
    expect(ingredient.amount?.unit).toBe('g');
    expect(ingredient.amountNote).toBeNull();
  });

  it('amountNote 指定の DTO を RecipeIngredient に変換する (M4)', () => {
    const dto: RecipeIngredientDto = {
      productRef: null,
      displayName: '塩',
      amountValue: null,
      amountUnit: null,
      amountNote: '少々',
    };
    const ingredient = toIngredient(dto);
    expect(ingredient.amount).toBeNull();
    expect(ingredient.amountNote).toBe('少々');
  });

  it('productRef が文字列のときは ProductId に変換する (M5)', () => {
    const dto: RecipeIngredientDto = {
      productRef: 'prod-abc',
      displayName: '豚バラ肉',
      amountValue: 200,
      amountUnit: 'g',
      amountNote: null,
    };
    const ingredient = toIngredient(dto);
    expect(ingredient.productRef?.value).toBe('prod-abc');
  });

  it('productRef が null のときは null を維持する (M6)', () => {
    const dto: RecipeIngredientDto = {
      productRef: null,
      displayName: 'だし',
      amountValue: 500,
      amountUnit: 'ml',
      amountNote: null,
    };
    expect(toIngredient(dto).productRef).toBeNull();
  });

  it('amountValue が null なら amount を null にする (M7)', () => {
    const dto: RecipeIngredientDto = {
      productRef: null,
      displayName: 'こしょう',
      amountValue: null,
      amountUnit: null,
      amountNote: '適量',
    };
    expect(toIngredient(dto).amount).toBeNull();
  });

  it('amountValue が非 null でも amountUnit が null なら量なし扱いでドメインバリデーションエラー (MAP-GAP-1)', () => {
    const dto: RecipeIngredientDto = {
      productRef: null,
      displayName: 'こしょう',
      amountValue: 100,
      amountUnit: null,
      amountNote: null,
    };
    // toQuantity が null を返すため amount も amountNote もなしになる
    expect(() => toIngredient(dto)).toThrow('Either amount or amountNote is required');
  });
});

describe('toRecipeDto', () => {
  const buildRecipe = (): Recipe =>
    Recipe.reconstruct({
      id: RecipeId.fromString('recipe-1'),
      name: '肉じゃが',
      ingredients: [
        RecipeIngredient.create({
          productRef: { value: 'prod-1' },
          displayName: '玉ねぎ',
          amount: Quantity.of(200, 'g'),
          amountNote: null,
        }),
        RecipeIngredient.create({
          productRef: null,
          displayName: '塩',
          amount: null,
          amountNote: '少々',
        }),
      ],
      steps: [new CookingStep('切る'), new CookingStep('煮る')],
      baseServings: 4,
      tags: ['主菜', '作り置き向き'],
      cookingTime: 30,
      notes: 'コツは弱火でじっくり',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

  it('Recipe の全フィールドを RecipeDto に変換する (M8)', () => {
    const dto = toRecipeDto(buildRecipe());

    expect(dto.id).toBe('recipe-1');
    expect(dto.name).toBe('肉じゃが');
    expect(dto.baseServings).toBe(4);
    expect(dto.servings).toBeNull();
    expect(dto.cookingTime).toBe(30);
    expect(dto.tags).toEqual(['主菜', '作り置き向き']);
    expect(dto.notes).toBe('コツは弱火でじっくり');
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('ingredients を DTO に変換する（amount / amountNote の両パターン）(M9)', () => {
    const dto = toRecipeDto(buildRecipe());

    expect(dto.ingredients).toHaveLength(2);
    expect(dto.ingredients[0]).toEqual({
      productRef: 'prod-1',
      displayName: '玉ねぎ',
      amountValue: 200,
      amountUnit: 'g',
      amountNote: null,
    });
    expect(dto.ingredients[1]).toEqual({
      productRef: null,
      displayName: '塩',
      amountValue: null,
      amountUnit: null,
      amountNote: '少々',
    });
  });

  it('steps を DTO に変換する (M10)', () => {
    const dto = toRecipeDto(buildRecipe());

    expect(dto.steps).toEqual([{ description: '切る' }, { description: '煮る' }]);
  });

  it('cookingTime が null のときは null を返す (M11)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-2'),
      name: 'みそ汁',
      ingredients: [],
      steps: [new CookingStep('煮る')],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(toRecipeDto(recipe).cookingTime).toBeNull();
  });

  it('tags が空の場合は空配列を返す (MAP-GAP-2)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-4'),
      name: 'テスト',
      ingredients: [],
      steps: [new CookingStep('手順')],
      baseServings: 1,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(toRecipeDto(recipe).tags).toEqual([]);
  });

  it('notes が空文字の場合は空文字を返す (MAP-GAP-3)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-5'),
      name: 'テスト',
      ingredients: [],
      steps: [new CookingStep('手順')],
      baseServings: 1,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(toRecipeDto(recipe).notes).toBe('');
  });

  it('productRef が null の食材は productRef: null を返す (M12)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-3'),
      name: 'シンプル料理',
      ingredients: [
        RecipeIngredient.create({
          productRef: null,
          displayName: '水',
          amount: Quantity.of(300, 'ml'),
          amountNote: null,
        }),
      ],
      steps: [new CookingStep('沸かす')],
      baseServings: 1,
      tags: [],
      cookingTime: 5,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(toRecipeDto(recipe).ingredients[0]?.productRef).toBeNull();
  });

  // T-MAP01
  it('servings: 4 のレシピを変換すると dto.servings === 4 になる (T-MAP01)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-6'),
      name: 'テスト',
      ingredients: [],
      steps: [new CookingStep('手順')],
      baseServings: 4,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: 4,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(toRecipeDto(recipe).servings).toBe(4);
  });

  // T-MAP02
  it('servings: null のレシピを変換すると dto.servings === null になる (T-MAP02)', () => {
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('recipe-7'),
      name: 'テスト',
      ingredients: [],
      steps: [new CookingStep('手順')],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(toRecipeDto(recipe).servings).toBeNull();
  });
});
