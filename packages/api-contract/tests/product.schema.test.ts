import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  priceRecordIdParamSchema,
  productCategorySchema,
  recordPriceSchema,
  updatePriceRecordSchema,
  updateProductSchema,
} from '../src/product.schema';

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

  it('プリセット外の自由入力 defaultUnit も受け入れ、空文字は reject する（項目3）', () => {
    expect(createProductSchema.parse({ ...VALID_PRODUCT, defaultUnit: '箱' }).defaultUnit).toBe(
      '箱',
    );
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, defaultUnit: '' })).toThrow();
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

  it('プリセット外の自由入力 packageSizeUnit も受け入れ、空文字は reject する（項目3）', () => {
    expect(recordPriceSchema.parse({ ...VALID_PRICE, packageSizeUnit: '箱' }).packageSizeUnit).toBe(
      '箱',
    );
    expect(() => recordPriceSchema.parse({ ...VALID_PRICE, packageSizeUnit: '' })).toThrow();
  });
});

describe('updatePriceRecordSchema', () => {
  const VALID_UPDATE = {
    storeId: VALID_STORE_ID,
    priceAmount: 148,
    packageSizeValue: 1,
    packageSizeUnit: '個',
  };

  it('Z-UPR-01: 正常な入力を受け入れる', () => {
    expect(updatePriceRecordSchema.parse(VALID_UPDATE)).toEqual(VALID_UPDATE);
  });

  it('Z-UPR-02: 不正な storeId を reject する', () => {
    expect(() =>
      updatePriceRecordSchema.parse({ ...VALID_UPDATE, storeId: 'not-a-uuid' }),
    ).toThrow();
  });

  it.each([0, -1])('Z-UPR-03/04: priceAmount が %d の入力を reject する', (priceAmount) => {
    expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, priceAmount })).toThrow();
  });

  it.each([0, -1])(
    'Z-UPR-05/06: packageSizeValue が %d の入力を reject する',
    (packageSizeValue) => {
      expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeValue })).toThrow();
    },
  );

  it('Z-UPR-07: packageSizeUnit の自由入力を受け入れ、空文字は reject する', () => {
    expect(
      updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeUnit: '箱' }).packageSizeUnit,
    ).toBe('箱');
    expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeUnit: '' })).toThrow();
  });

  // Z-UPR-09/10: DB 精度（price_amount = numeric(10,1) / package_size_value = numeric(10,3)）を
  // 超える値はスキーマで弾く。弾かないと Postgres 22003 が素の Error として上がり 500 になる
  // （セキュリティレビュー Medium 1）。
  it.each([
    ['Z-UPR-09', { priceAmount: 1_000_000_000 }],
    ['Z-UPR-10', { packageSizeValue: 10_000_000 }],
  ])('%s: DB 精度を超える値を reject する', (_id, overrides) => {
    expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, ...overrides })).toThrow();
  });

  it('Z-UPR-11: 上限ちょうどの値は受け入れる（境界）', () => {
    expect(
      updatePriceRecordSchema.parse({
        ...VALID_UPDATE,
        priceAmount: 999_999_999,
        packageSizeValue: 9_999_999,
      }).priceAmount,
    ).toBe(999_999_999);
  });

  // 同型の穴は既存の POST 側にもあったため両方直した（ユーザー確定・2026-08-06）。
  it.each([
    ['Z-PR-09', { priceAmount: 1_000_000_000 }],
    ['Z-PR-10', { packageSizeValue: 10_000_000 }],
  ])('%s: recordPriceSchema も DB 精度を超える値を reject する', (_id, overrides) => {
    expect(() => recordPriceSchema.parse({ ...VALID_UPDATE, ...overrides })).toThrow();
  });

  it('Z-UPR-08: recordPriceSchema とは独立したスキーマである（退行防止）', () => {
    // 現時点ではキー集合が一致するが、片方だけ変更しても他方は影響を受けない
    // （契約設計書 §2.1 の「複製する」判断が誤って同一参照へ統合されないことの記録目的）。
    expect(Object.keys(updatePriceRecordSchema.shape).sort()).toEqual(
      Object.keys(recordPriceSchema.shape).sort(),
    );
    expect(updatePriceRecordSchema).not.toBe(recordPriceSchema);
  });
});

describe('priceRecordIdParamSchema', () => {
  const VALID_PRICE_RECORD_ID = '22222222-2222-4222-8222-222222222222';

  it('商品 ID と価格記録 ID の 2 つを受け入れる', () => {
    expect(
      priceRecordIdParamSchema.parse({
        id: VALID_STORE_ID,
        priceRecordId: VALID_PRICE_RECORD_ID,
      }),
    ).toEqual({ id: VALID_STORE_ID, priceRecordId: VALID_PRICE_RECORD_ID });
  });

  it('priceRecordId が UUID でない入力を reject する', () => {
    expect(() =>
      priceRecordIdParamSchema.parse({ id: VALID_STORE_ID, priceRecordId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('priceRecordId が欠けている入力を reject する', () => {
    expect(() => priceRecordIdParamSchema.parse({ id: VALID_STORE_ID })).toThrow();
  });
});
