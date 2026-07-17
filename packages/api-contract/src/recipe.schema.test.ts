import { describe, expect, it } from 'vitest';
import {
  cookingStepSchema,
  createRecipeSchema,
  recipeIngredientSchema,
  recipeTagSchema,
  unitSchema,
  updateRecipeSchema,
} from './recipe.schema';

const VALID_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const VALID_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  '大さじ',
  '小さじ',
  'cup',
  '個',
  '本',
  '枚',
  '玉',
  '尾',
  '切れ',
  '束',
  '袋',
  '缶',
  '合',
];

const VALID_TAGS = ['主菜', '副菜', '汁物', '作り置き向き', '冷凍可'];

const INGREDIENT_WITH_AMOUNT = {
  productRef: VALID_PRODUCT_ID,
  displayName: '玉ねぎ',
  amountValue: 2,
  amountUnit: '個',
  amountNote: null,
};

const INGREDIENT_WITH_NOTE = {
  productRef: null,
  displayName: '塩',
  amountValue: null,
  amountUnit: null,
  amountNote: '適量',
};

describe('unitSchema', () => {
  it.each(VALID_UNITS)('%s を受け入れる', (unit) => {
    expect(unitSchema.parse(unit)).toBe(unit);
  });

  it('未知の単位を reject する', () => {
    expect(() => unitSchema.parse('箱')).toThrow();
  });
});

describe('recipeTagSchema', () => {
  it.each(VALID_TAGS)('%s を受け入れる', (tag) => {
    expect(recipeTagSchema.parse(tag)).toBe(tag);
  });

  it('未知のタグを reject する', () => {
    expect(() => recipeTagSchema.parse('デザート')).toThrow();
  });
});

describe('recipeIngredientSchema', () => {
  it('amountValue と amountUnit の組を受け入れる', () => {
    expect(recipeIngredientSchema.parse(INGREDIENT_WITH_AMOUNT)).toEqual(INGREDIENT_WITH_AMOUNT);
  });

  it('amountNote のみの入力を受け入れる', () => {
    expect(recipeIngredientSchema.parse(INGREDIENT_WITH_NOTE)).toEqual(INGREDIENT_WITH_NOTE);
  });

  it('空白の amountNote を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({ ...INGREDIENT_WITH_NOTE, amountNote: '   ' }),
    ).toThrow('amountNote must be non-blank when provided');
  });

  it('amountValue のみ（amountUnit が null）を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({
        ...INGREDIENT_WITH_AMOUNT,
        amountUnit: null,
      }),
    ).toThrow('amountValue and amountUnit must be provided together');
  });

  it('amountUnit のみ（amountValue が null）を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({
        productRef: null,
        displayName: '砂糖',
        amountValue: null,
        amountUnit: 'g',
        amountNote: null,
      }),
    ).toThrow('amountValue and amountUnit must be provided together');
  });

  it('amount と amountNote の両方指定を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({
        ...INGREDIENT_WITH_AMOUNT,
        amountNote: '適量',
      }),
    ).toThrow('amount and amountNote cannot both be set');
  });

  it('amount と amountNote の両方が null の入力を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({
        productRef: null,
        displayName: '水',
        amountValue: null,
        amountUnit: null,
        amountNote: null,
      }),
    ).toThrow('Either amount or amountNote is required');
  });

  it('空白の displayName を reject する', () => {
    expect(() =>
      recipeIngredientSchema.parse({ ...INGREDIENT_WITH_AMOUNT, displayName: '  ' }),
    ).toThrow();
  });
});

describe('cookingStepSchema', () => {
  it('正常な description を受け入れる', () => {
    expect(cookingStepSchema.parse({ description: '玉ねぎを切る' })).toEqual({
      description: '玉ねぎを切る',
    });
  });

  it.each(['', '   '])('空白の description %j を reject する', (description) => {
    expect(() => cookingStepSchema.parse({ description })).toThrow();
  });
});

describe('createRecipeSchema', () => {
  const VALID_RECIPE = {
    name: 'カレー',
    ingredients: [INGREDIENT_WITH_AMOUNT],
    steps: [{ description: '炒める' }],
    baseServings: 4,
    tags: ['主菜'],
    cookingTime: 30,
    notes: 'メモ',
    servings: 2,
  };

  it('正常な入力を受け入れる', () => {
    expect(createRecipeSchema.parse(VALID_RECIPE)).toEqual(VALID_RECIPE);
  });

  it('servings 省略を受け入れる', () => {
    const withoutServings = {
      name: 'カレー',
      ingredients: [INGREDIENT_WITH_AMOUNT],
      steps: [{ description: '炒める' }],
      baseServings: 4,
      tags: ['主菜'],
      cookingTime: 30,
      notes: 'メモ',
    };
    expect(createRecipeSchema.parse(withoutServings)).toEqual(withoutServings);
  });

  it('cookingTime が null の入力を受け入れる', () => {
    expect(createRecipeSchema.parse({ ...VALID_RECIPE, cookingTime: null }).cookingTime).toBeNull();
  });

  it.each([0, -1])('baseServings が %d の入力を reject する', (baseServings) => {
    expect(() => createRecipeSchema.parse({ ...VALID_RECIPE, baseServings })).toThrow();
  });

  it('cookingTime が負数の入力を reject する', () => {
    expect(() => createRecipeSchema.parse({ ...VALID_RECIPE, cookingTime: -1 })).toThrow();
  });

  it('cookingTime が小数の入力を reject する', () => {
    expect(() => createRecipeSchema.parse({ ...VALID_RECIPE, cookingTime: 1.5 })).toThrow();
  });

  it('空白の name を reject する', () => {
    expect(() => createRecipeSchema.parse({ ...VALID_RECIPE, name: '  ' })).toThrow();
  });

  it('ingredients と steps が空配列の入力を受け入れる', () => {
    expect(createRecipeSchema.parse({ ...VALID_RECIPE, ingredients: [], steps: [] })).toMatchObject(
      { ingredients: [], steps: [] },
    );
  });
});

describe('updateRecipeSchema', () => {
  const VALID_UPDATE = {
    name: 'カレー',
    ingredients: [INGREDIENT_WITH_NOTE],
    steps: [{ description: '煮込む' }],
    tags: ['主菜', '作り置き向き'],
    cookingTime: null,
    notes: '',
    servings: null,
  };

  it('正常な入力を受け入れる', () => {
    expect(updateRecipeSchema.parse(VALID_UPDATE)).toEqual(VALID_UPDATE);
  });

  it('baseServings を含まない（createRecipeSchema との差）', () => {
    expect(updateRecipeSchema.parse(VALID_UPDATE)).not.toHaveProperty('baseServings');
  });

  it('未知の tag を reject する', () => {
    expect(() => updateRecipeSchema.parse({ ...VALID_UPDATE, tags: ['デザート'] })).toThrow();
  });
});
