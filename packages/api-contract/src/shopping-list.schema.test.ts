import type { ShoppingListDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import {
  addItemSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  shoppingItemIdParamSchema,
  shoppingItemResponseSchema,
  shoppingListIdParamSchema,
  shoppingListResponseSchema,
} from './shopping-list.schema';
import type { ShoppingListResponse } from './shopping-list.schema';

const VALID_SHOPPING_LIST_ID = '11111111-1111-4111-8111-111111111111';
const VALID_MEAL_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const VALID_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const VALID_PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const VALID_TARGET_STORE_ID = '55555555-5555-4555-8555-555555555555';
const VALID_ACTUAL_STORE_ID = '66666666-6666-4666-8666-666666666666';

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

describe('generateShoppingListSchema', () => {
  it('正常な mealPlanId を受け入れる', () => {
    expect(generateShoppingListSchema.parse({ mealPlanId: VALID_MEAL_PLAN_ID })).toEqual({
      mealPlanId: VALID_MEAL_PLAN_ID,
    });
  });

  it('不正な mealPlanId を reject する', () => {
    expect(() => generateShoppingListSchema.parse({ mealPlanId: 'not-a-uuid' })).toThrow();
  });
});

describe('addItemSchema', () => {
  it.each(['', '   '])('空白の displayName %j を reject する', (displayName) => {
    expect(() =>
      addItemSchema.parse({
        displayName,
        requiredAmount: { value: 1, unit: '個' },
        productId: null,
        targetStoreId: null,
      }),
    ).toThrow();
  });

  it('requiredAmount.value が 0 の入力を受け入れる', () => {
    expect(
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: 0, unit: '個' },
        productId: null,
        targetStoreId: null,
      }),
    ).toEqual({
      displayName: '玉ねぎ',
      requiredAmount: { value: 0, unit: '個' },
      productId: null,
      targetStoreId: null,
    });
  });

  it('requiredAmount.value が負数の入力を reject する', () => {
    expect(() =>
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: -1, unit: '個' },
        productId: null,
        targetStoreId: null,
      }),
    ).toThrow();
  });

  it.each(VALID_UNITS)('unitSchema の %s を受け入れる', (unit) => {
    expect(
      addItemSchema.parse({
        displayName: '食材',
        requiredAmount: { value: 1, unit },
        productId: null,
        targetStoreId: null,
      }).requiredAmount.unit,
    ).toBe(unit);
  });

  it('プリセット外の自由入力単位も受け入れ、空文字は reject する（項目3）', () => {
    expect(
      addItemSchema.parse({
        displayName: '食材',
        requiredAmount: { value: 1, unit: '箱' },
        productId: null,
        targetStoreId: null,
      }).requiredAmount.unit,
    ).toBe('箱');
    expect(() =>
      addItemSchema.parse({
        displayName: '食材',
        requiredAmount: { value: 1, unit: '' },
        productId: null,
        targetStoreId: null,
      }),
    ).toThrow();
  });

  it('productId と targetStoreId の null を受け入れる', () => {
    expect(
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: 1, unit: '個' },
        productId: null,
        targetStoreId: null,
      }),
    ).toMatchObject({ productId: null, targetStoreId: null });
  });

  it('productId のキー省略を reject する', () => {
    expect(() =>
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: 1, unit: '個' },
        targetStoreId: null,
      }),
    ).toThrow();
  });

  it('targetStoreId のキー省略を reject する', () => {
    expect(() =>
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: 1, unit: '個' },
        productId: null,
      }),
    ).toThrow();
  });
});

describe('markAsBoughtSchema', () => {
  it('actualPrice.amount が 0 の入力を受け入れる', () => {
    expect(
      markAsBoughtSchema.parse({
        actualPrice: { amount: 0, currency: 'JPY' },
        actualStoreId: VALID_ACTUAL_STORE_ID,
      }),
    ).toEqual({
      actualPrice: { amount: 0, currency: 'JPY' },
      actualStoreId: VALID_ACTUAL_STORE_ID,
    });
  });

  it('actualPrice.amount が負数の入力を reject する', () => {
    expect(() =>
      markAsBoughtSchema.parse({
        actualPrice: { amount: -1, currency: 'JPY' },
        actualStoreId: VALID_ACTUAL_STORE_ID,
      }),
    ).toThrow();
  });

  it('JPY 以外の currency を reject する', () => {
    expect(() =>
      markAsBoughtSchema.parse({
        actualPrice: { amount: 100, currency: 'USD' },
        actualStoreId: VALID_ACTUAL_STORE_ID,
      }),
    ).toThrow();
  });

  it('不正な actualStoreId を reject する', () => {
    expect(() =>
      markAsBoughtSchema.parse({
        actualPrice: { amount: 100, currency: 'JPY' },
        actualStoreId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});

describe('reassignStoreSchema', () => {
  it('不正な targetStoreId を reject する', () => {
    expect(() => reassignStoreSchema.parse({ targetStoreId: 'not-a-uuid' })).toThrow();
  });
});

describe('shopping list parameter schemas', () => {
  it('正常な id と itemId を受け入れる', () => {
    expect(
      shoppingItemIdParamSchema.parse({ id: VALID_SHOPPING_LIST_ID, itemId: VALID_ITEM_ID }),
    ).toEqual({ id: VALID_SHOPPING_LIST_ID, itemId: VALID_ITEM_ID });
  });

  it('不正な ShoppingList id を reject する', () => {
    expect(() => shoppingListIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });

  it('不正な ShoppingItem itemId を reject する', () => {
    expect(() =>
      shoppingItemIdParamSchema.parse({
        id: VALID_SHOPPING_LIST_ID,
        itemId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});

describe('shoppingItemResponseSchema', () => {
  it('requiredAmount と amountNote が両方 null の場合は reject する', () => {
    expect(() =>
      shoppingItemResponseSchema.parse({
        id: VALID_ITEM_ID,
        productId: null,
        displayName: '玉ねぎ',
        requiredAmount: null,
        amountNote: null,
        targetStoreId: null,
        status: 'pending',
        actualPrice: null,
        actualStoreId: null,
        source: 'from_meal_plan',
      }),
    ).toThrow('Exactly one of requiredAmount or amountNote must be set');
  });

  it('requiredAmount と amountNote が両方非 null の場合は reject する', () => {
    expect(() =>
      shoppingItemResponseSchema.parse({
        id: VALID_ITEM_ID,
        productId: VALID_PRODUCT_ID,
        displayName: '玉ねぎ',
        requiredAmount: { value: 2, unit: '個' },
        amountNote: '適量',
        targetStoreId: VALID_TARGET_STORE_ID,
        status: 'bought',
        actualPrice: { amount: 198, currency: 'JPY' },
        actualStoreId: VALID_ACTUAL_STORE_ID,
        source: 'from_meal_plan',
      }),
    ).toThrow('Exactly one of requiredAmount or amountNote must be set');
  });

  it('requiredAmount のみ非 null かつ nullable フィールドが null の場合を受け入れる', () => {
    const item = {
      id: VALID_ITEM_ID,
      productId: null,
      displayName: '玉ねぎ',
      requiredAmount: { value: 2, unit: '個' },
      amountNote: null,
      targetStoreId: null,
      status: 'pending',
      actualPrice: null,
      actualStoreId: null,
      source: 'from_meal_plan',
    };

    expect(shoppingItemResponseSchema.parse(item)).toEqual(item);
  });

  it('amountNote のみ非 null かつ nullable フィールドが非 null の場合を受け入れる', () => {
    const item = {
      id: VALID_ITEM_ID,
      productId: VALID_PRODUCT_ID,
      displayName: '塩',
      requiredAmount: null,
      amountNote: '適量',
      targetStoreId: VALID_TARGET_STORE_ID,
      status: 'bought',
      actualPrice: { amount: 128, currency: 'JPY' },
      actualStoreId: VALID_ACTUAL_STORE_ID,
      source: 'manually_added',
    };

    expect(shoppingItemResponseSchema.parse(item)).toEqual(item);
  });
});

describe('shoppingListResponseSchema', () => {
  it('Task 3 Mapper の実出力相当の ShoppingListDto を parse できる', () => {
    const dto: ShoppingListDto = {
      id: VALID_SHOPPING_LIST_ID,
      mealPlanId: VALID_MEAL_PLAN_ID,
      shoppingDate: '2026-07-11',
      status: 'active',
      items: [
        {
          id: VALID_ITEM_ID,
          productId: VALID_PRODUCT_ID,
          displayName: '玉ねぎ',
          requiredAmount: { value: 2, unit: '個' },
          amountNote: null,
          targetStoreId: VALID_TARGET_STORE_ID,
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: VALID_ACTUAL_STORE_ID,
          source: 'from_meal_plan',
        },
      ],
      createdAt: '2026-07-11T01:00:00.000Z',
    };

    const parsed: ShoppingListResponse = shoppingListResponseSchema.parse(dto);

    expect(parsed).toEqual(dto);
  });

  it('items が空配列の ShoppingListDto を parse できる', () => {
    const dto: ShoppingListDto = {
      id: VALID_SHOPPING_LIST_ID,
      mealPlanId: VALID_MEAL_PLAN_ID,
      shoppingDate: '2026-07-11',
      status: 'completed',
      items: [],
      createdAt: '2026-07-11T01:00:00.000Z',
    };

    const parsed: ShoppingListResponse = shoppingListResponseSchema.parse(dto);

    expect(parsed).toEqual(dto);
  });
});
