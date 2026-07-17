import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  productCategorySchema,
  recordPriceSchema,
  updateProductSchema,
} from './product.schema';

const VALID_STORE_ID = '11111111-1111-4111-8111-111111111111';

const VALID_CATEGORIES = ['野菜', '肉', '魚', '調味料', '乾物', '冷凍', 'その他'];

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

const VALID_PRODUCT = {
  name: '玉ねぎ',
  aliases: ['たまねぎ', 'オニオン'],
  category: '野菜',
  defaultUnit: '個',
};

describe('productCategorySchema', () => {
  it.each(VALID_CATEGORIES)('%s を受け入れる', (category) => {
    expect(productCategorySchema.parse(category)).toBe(category);
  });

  it('未知のカテゴリを reject する', () => {
    expect(() => productCategorySchema.parse('飲料')).toThrow();
  });
});

describe('createProductSchema', () => {
  it('正常な入力を受け入れる', () => {
    expect(createProductSchema.parse(VALID_PRODUCT)).toEqual(VALID_PRODUCT);
  });

  it('aliases が空配列の入力を受け入れる', () => {
    expect(createProductSchema.parse({ ...VALID_PRODUCT, aliases: [] }).aliases).toEqual([]);
  });

  it.each(['', '   '])('空白の name %j を reject する', (name) => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, name })).toThrow();
  });

  it.each(VALID_UNITS)('defaultUnit の %s を受け入れる', (defaultUnit) => {
    expect(createProductSchema.parse({ ...VALID_PRODUCT, defaultUnit }).defaultUnit).toBe(
      defaultUnit,
    );
  });

  it('unitSchema の 17 値に含まれない defaultUnit を reject する', () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, defaultUnit: '箱' })).toThrow();
  });

  it('未知の category を reject する', () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, category: '飲料' })).toThrow();
  });

  it('aliases に文字列以外を含む入力を reject する', () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, aliases: [1] })).toThrow();
  });
});

describe('updateProductSchema', () => {
  it('正常な入力を受け入れる', () => {
    expect(updateProductSchema.parse(VALID_PRODUCT)).toEqual(VALID_PRODUCT);
  });

  it.each(['', '   '])('空白の name %j を reject する', (name) => {
    expect(() => updateProductSchema.parse({ ...VALID_PRODUCT, name })).toThrow();
  });
});

describe('recordPriceSchema', () => {
  const VALID_PRICE = {
    storeId: VALID_STORE_ID,
    priceAmount: 198,
    packageSizeValue: 3,
    packageSizeUnit: '個',
  };

  it('正常な入力を受け入れる', () => {
    expect(recordPriceSchema.parse(VALID_PRICE)).toEqual(VALID_PRICE);
  });

  it('不正な storeId を reject する', () => {
    expect(() => recordPriceSchema.parse({ ...VALID_PRICE, storeId: 'not-a-uuid' })).toThrow();
  });

  it.each([0, -1])('priceAmount が %d の入力を reject する', (priceAmount) => {
    expect(() => recordPriceSchema.parse({ ...VALID_PRICE, priceAmount })).toThrow();
  });

  it.each([0, -1])('packageSizeValue が %d の入力を reject する', (packageSizeValue) => {
    expect(() => recordPriceSchema.parse({ ...VALID_PRICE, packageSizeValue })).toThrow();
  });

  it('unitSchema の 17 値に含まれない packageSizeUnit を reject する', () => {
    expect(() => recordPriceSchema.parse({ ...VALID_PRICE, packageSizeUnit: '箱' })).toThrow();
  });
});
