import type { PantryDto, StockDto } from '@cookpit/application';
import { describe, expect, it } from 'vitest';
import { addItemSchema } from '../src/shopping-list.schema';
import {
  addStockSchema,
  consumeStockSchema,
  pantryResponseSchema,
  stockIdParamSchema,
  stockResponseSchema,
  storageLocationSchema,
  updateStockSchema,
} from '../src/pantry.schema';
import type { PantryResponse, StockResponse } from '../src/pantry.schema';

const VALID_STOCK_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_VALID_STOCK_ID = '22222222-2222-4222-8222-222222222222';
const VALID_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

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

const STOCK_WITH_NULLS: StockDto = {
  id: VALID_STOCK_ID,
  productId: null,
  displayName: '塩',
  amount: { value: 1, unit: '袋' },
  purchasedAt: '2026-07-17T01:00:00.000Z',
  expiresAt: null,
  storedLocation: null,
};

const STOCK_WITH_VALUES: StockDto = {
  id: SECOND_VALID_STOCK_ID,
  productId: VALID_PRODUCT_ID,
  displayName: '玉ねぎ',
  amount: { value: 3, unit: '個' },
  purchasedAt: '2026-07-17T02:00:00.000Z',
  expiresAt: '2026-07-24',
  storedLocation: 'fridge',
};

describe('stockIdParamSchema', () => {
  it('正常な stockId を受け入れる', () => {
    expect(stockIdParamSchema.parse({ stockId: VALID_STOCK_ID })).toEqual({
      stockId: VALID_STOCK_ID,
    });
  });

  it('不正な stockId を reject する', () => {
    expect(() => stockIdParamSchema.parse({ stockId: 'not-a-uuid' })).toThrow();
  });
});

describe('consumeStockSchema', () => {
  it('amount.value が 0 の入力を reject し、addItemSchema の 0 許容との差を維持する', () => {
    expect(() => consumeStockSchema.parse({ amount: { value: 0, unit: '個' } })).toThrow();
    expect(
      addItemSchema.parse({
        displayName: '玉ねぎ',
        requiredAmount: { value: 0, unit: '個' },
        productId: null,
        targetStoreId: null,
      }).requiredAmount.value,
    ).toBe(0);
  });

  it('amount.value が負数の入力を reject する', () => {
    expect(() => consumeStockSchema.parse({ amount: { value: -1, unit: '個' } })).toThrow();
  });

  it('amount.value が正数の入力を受け入れる', () => {
    expect(consumeStockSchema.parse({ amount: { value: 1, unit: '個' } })).toEqual({
      amount: { value: 1, unit: '個' },
    });
  });

  it.each(VALID_UNITS)('unitSchema の %s を受け入れる', (unit) => {
    expect(consumeStockSchema.parse({ amount: { value: 1, unit } }).amount.unit).toBe(unit);
  });

  it('プリセット外の自由入力単位も受け入れ、空文字は reject する（項目3）', () => {
    expect(consumeStockSchema.parse({ amount: { value: 1, unit: '箱' } }).amount.unit).toBe('箱');
    expect(() => consumeStockSchema.parse({ amount: { value: 1, unit: '' } })).toThrow();
  });

  it('amount キーの省略を reject する', () => {
    expect(() => consumeStockSchema.parse({})).toThrow();
  });
});

describe('storageLocationSchema', () => {
  it.each(['fridge', 'freezer', 'pantry'])('%s を受け入れる', (location) => {
    expect(storageLocationSchema.parse(location)).toBe(location);
  });

  it('未知の保存場所を reject する', () => {
    expect(() => storageLocationSchema.parse('counter')).toThrow();
  });
});

describe('addStockSchema', () => {
  const VALID_ADD_STOCK = {
    displayName: '玉ねぎ',
    amount: { value: 3, unit: '個' },
    storedLocation: 'fridge',
    expiresAt: '2026-07-31',
  };

  it('必須＋任意すべて埋めた入力を受け入れる', () => {
    expect(addStockSchema.parse(VALID_ADD_STOCK)).toEqual(VALID_ADD_STOCK);
  });

  it('storedLocation / expiresAt が null の入力を受け入れる', () => {
    const input = { ...VALID_ADD_STOCK, storedLocation: null, expiresAt: null };
    expect(addStockSchema.parse(input)).toEqual(input);
  });

  it('displayName が空文字の入力を reject する', () => {
    expect(() => addStockSchema.parse({ ...VALID_ADD_STOCK, displayName: '' })).toThrow();
  });

  it('amount.value が 0 の入力を reject する', () => {
    expect(() =>
      addStockSchema.parse({ ...VALID_ADD_STOCK, amount: { value: 0, unit: '個' } }),
    ).toThrow();
  });

  it('未知の storedLocation を reject する', () => {
    expect(() => addStockSchema.parse({ ...VALID_ADD_STOCK, storedLocation: 'counter' })).toThrow();
  });

  it('不正な expiresAt（ISO date でない）を reject する', () => {
    expect(() => addStockSchema.parse({ ...VALID_ADD_STOCK, expiresAt: '2026/07/31' })).toThrow();
  });
});

describe('updateStockSchema', () => {
  const VALID_UPDATE_STOCK = {
    amount: { value: 2, unit: '個' },
    storedLocation: 'fridge',
    expiresAt: '2026-08-20',
  };

  it('必須 3 項目を満たす入力を受け入れる', () => {
    expect(updateStockSchema.parse(VALID_UPDATE_STOCK)).toEqual(VALID_UPDATE_STOCK);
  });

  it('storedLocation / expiresAt が null の入力を受け入れる', () => {
    const input = { ...VALID_UPDATE_STOCK, storedLocation: null, expiresAt: null };
    expect(updateStockSchema.parse(input)).toEqual(input);
  });

  it.each([0, -1])('amount.value が %s の入力を reject する', (value) => {
    expect(() =>
      updateStockSchema.parse({
        ...VALID_UPDATE_STOCK,
        amount: { value, unit: '個' },
      }),
    ).toThrow();
  });

  it('amount.value の小数を受け入れる', () => {
    expect(
      updateStockSchema.parse({
        ...VALID_UPDATE_STOCK,
        amount: { value: 1.25, unit: 'g' },
      }).amount,
    ).toEqual({ value: 1.25, unit: 'g' });
  });

  it('expiresAt の datetime 形式を reject する', () => {
    expect(() =>
      updateStockSchema.parse({
        ...VALID_UPDATE_STOCK,
        expiresAt: '2026-08-07T00:00:00Z',
      }),
    ).toThrow();
  });

  it('storedLocation の enum 外の値を reject する', () => {
    expect(() =>
      updateStockSchema.parse({ ...VALID_UPDATE_STOCK, storedLocation: 'garage' }),
    ).toThrow();
  });

  it.each([
    { storedLocation: 'fridge', expiresAt: '2026-08-20' },
    { amount: { value: 2, unit: '個' }, expiresAt: '2026-08-20' },
    { amount: { value: 2, unit: '個' }, storedLocation: 'fridge' },
  ])('必須キーが省略された入力を reject する', (input) => {
    expect(() => updateStockSchema.parse(input)).toThrow();
  });

  it('displayName を reject せず parse 結果から strip する', () => {
    const parsed = updateStockSchema.parse({
      ...VALID_UPDATE_STOCK,
      displayName: '玉ねぎ',
    });

    expect(parsed).toEqual(VALID_UPDATE_STOCK);
    expect(parsed).not.toHaveProperty('displayName');
  });

  it('プリセット外の自由入力単位を受理し、空文字は reject する', () => {
    expect(
      updateStockSchema.parse({
        ...VALID_UPDATE_STOCK,
        amount: { value: 1, unit: '箱' },
      }).amount.unit,
    ).toBe('箱');
    expect(() =>
      updateStockSchema.parse({
        ...VALID_UPDATE_STOCK,
        amount: { value: 1, unit: '' },
      }),
    ).toThrow();
  });
});

describe('stockResponseSchema', () => {
  it('nullable フィールドがすべて null の StockDto を parse できる', () => {
    const parsed: StockResponse = stockResponseSchema.parse(STOCK_WITH_NULLS);

    expect(parsed).toEqual(STOCK_WITH_NULLS);
  });

  it('nullable フィールドがすべて非 null の StockDto を parse できる', () => {
    const parsed: StockResponse = stockResponseSchema.parse(STOCK_WITH_VALUES);

    expect(parsed).toEqual(STOCK_WITH_VALUES);
  });

  it('purchasedAt が ISO datetime 形式でない場合は reject する', () => {
    expect(() =>
      stockResponseSchema.parse({ ...STOCK_WITH_VALUES, purchasedAt: '2026-07-17' }),
    ).toThrow();
  });

  it.each(['2026/07/24', '2026-07-24T00:00:00.000Z'])(
    'expiresAt の不正な ISO date %s を reject する',
    (expiresAt) => {
      expect(() => stockResponseSchema.parse({ ...STOCK_WITH_VALUES, expiresAt })).toThrow();
    },
  );
});

describe('pantryResponseSchema', () => {
  it('stocks が空配列の PantryDto を parse できる', () => {
    const dto: PantryDto = { stocks: [] };
    const parsed: PantryResponse = pantryResponseSchema.parse(dto);

    expect(parsed).toEqual(dto);
  });

  it('複数 Stock の PantryDto を parse できる', () => {
    const dto: PantryDto = { stocks: [STOCK_WITH_NULLS, STOCK_WITH_VALUES] };
    const parsed: PantryResponse = pantryResponseSchema.parse(dto);

    expect(parsed).toEqual(dto);
  });
});
