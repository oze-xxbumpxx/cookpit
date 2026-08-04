import { describe, expect, it } from 'vitest';
import {
  createStoreSchema,
  storeResponseSchema,
  storeSchema,
  storeUsageResponseSchema,
} from '../src/store.schema';

const VALID_STORE_ID = '11111111-1111-4111-8111-111111111111';

describe('createStoreSchema', () => {
  it('正常な name を受け入れる', () => {
    expect(createStoreSchema.parse({ name: 'スーパーA' })).toEqual({ name: 'スーパーA' });
  });

  it.each(['', '   '])('空白の name %j を reject する', (name) => {
    expect(() => createStoreSchema.parse({ name })).toThrow();
  });

  it('255 文字の name を受け入れる', () => {
    const name = 'あ'.repeat(255);
    expect(createStoreSchema.parse({ name })).toEqual({ name });
  });

  it('256 文字の name を reject する', () => {
    expect(() => createStoreSchema.parse({ name: 'あ'.repeat(256) })).toThrow();
  });

  it('name キーの省略を reject する', () => {
    expect(() => createStoreSchema.parse({})).toThrow();
  });
});

describe('storeResponseSchema', () => {
  it('正常な StoreResponse を parse できる', () => {
    const dto = {
      id: VALID_STORE_ID,
      name: 'スーパーA',
      createdAt: '2026-07-17T01:00:00.000Z',
    };
    expect(storeResponseSchema.parse(dto)).toEqual(dto);
  });

  it('createdAt が数値の場合は reject する', () => {
    expect(() =>
      storeResponseSchema.parse({ id: VALID_STORE_ID, name: 'スーパーA', createdAt: 1 }),
    ).toThrow();
  });

  it('createdAt キーの省略を reject する', () => {
    expect(() => storeResponseSchema.parse({ id: VALID_STORE_ID, name: 'スーパーA' })).toThrow();
  });
});

describe('storeSchema', () => {
  it('正常な id と name を受け入れる', () => {
    expect(storeSchema.parse({ id: VALID_STORE_ID, name: 'スーパーA' })).toEqual({
      id: VALID_STORE_ID,
      name: 'スーパーA',
    });
  });

  it('不正な id を reject する', () => {
    expect(() => storeSchema.parse({ id: 'not-a-uuid', name: 'スーパーA' })).toThrow();
  });
});

describe('storeUsageResponseSchema', () => {
  it('正常な件数を parse できる', () => {
    const dto = { priceRecordCount: 3, shoppingItemCount: 2 };
    expect(storeUsageResponseSchema.parse(dto)).toEqual(dto);
  });

  it('0 件を受け入れる', () => {
    const dto = { priceRecordCount: 0, shoppingItemCount: 0 };
    expect(storeUsageResponseSchema.parse(dto)).toEqual(dto);
  });

  it('負数を reject する', () => {
    expect(() =>
      storeUsageResponseSchema.parse({ priceRecordCount: -1, shoppingItemCount: 0 }),
    ).toThrow();
  });

  it('小数を reject する', () => {
    expect(() =>
      storeUsageResponseSchema.parse({ priceRecordCount: 1.5, shoppingItemCount: 0 }),
    ).toThrow();
  });

  it('キーの省略を reject する', () => {
    expect(() => storeUsageResponseSchema.parse({ priceRecordCount: 1 })).toThrow();
  });
});
