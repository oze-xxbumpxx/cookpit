import { describe, expect, it } from 'vitest';
import {
  Money,
  PriceRecord,
  PriceRecordId,
  Product,
  ProductId,
  Quantity,
  Store,
  StoreId,
} from '@cookpit/domain';
import { normalizeAliases, toProductDto, toStoreNameMap } from '../../src/product/product.mapper';

function buildStore(id: string, name: string): Store {
  return Store.reconstruct({
    id: StoreId.fromString(id),
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function buildProduct(priceHistory: PriceRecord[] = []): Product {
  return Product.reconstruct({
    id: ProductId.fromString('product-1'),
    name: '玉ねぎ',
    aliases: ['タマネギ', '玉葱'],
    category: '野菜',
    defaultUnit: '個',
    priceHistory,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
}

function buildPriceRecord(storeId: StoreId): PriceRecord {
  return PriceRecord.create({
    id: PriceRecordId.fromString('record-1'),
    storeId,
    price: Money.of(300, 'JPY'),
    unitPrice: Money.of(100, 'JPY'),
    packageSize: Quantity.of(3, '個'),
    observedAt: new Date('2026-01-03T00:00:00.000Z'),
  });
}

describe('toStoreNameMap', () => {
  it('Store 配列を id→name の Map に変換する', () => {
    const map = toStoreNameMap([buildStore('store-1', '西友'), buildStore('store-2', 'ライフ')]);

    expect(map.get('store-1')).toBe('西友');
    expect(map.get('store-2')).toBe('ライフ');
    expect(map.size).toBe(2);
  });

  it('空配列なら空の Map を返す', () => {
    expect(toStoreNameMap([]).size).toBe(0);
  });
});

describe('normalizeAliases', () => {
  it('前後の空白を除去する', () => {
    expect(normalizeAliases([' 玉葱 ', 'タマネギ'])).toEqual(['玉葱', 'タマネギ']);
  });

  it('空文字・空白のみの要素を除去する', () => {
    expect(normalizeAliases(['', '  ', '人参'])).toEqual(['人参']);
  });

  it('空配列は空配列を返す', () => {
    expect(normalizeAliases([])).toEqual([]);
  });
});

describe('toProductDto', () => {
  it('Product の全フィールドを ProductDto に変換する', () => {
    const dto = toProductDto(buildProduct(), new Map());

    expect(dto.id).toBe('product-1');
    expect(dto.name).toBe('玉ねぎ');
    expect(dto.aliases).toEqual(['タマネギ', '玉葱']);
    expect(dto.category).toBe('野菜');
    expect(dto.defaultUnit).toBe('個');
    expect(dto.priceHistory).toEqual([]);
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('priceHistory を storeMap で店舗名解決しつつ DTO 化する', () => {
    const storeId = StoreId.fromString('store-1');
    const storeMap = toStoreNameMap([buildStore('store-1', '西友')]);

    const dto = toProductDto(buildProduct([buildPriceRecord(storeId)]), storeMap);

    expect(dto.priceHistory).toHaveLength(1);
    expect(dto.priceHistory[0]).toEqual({
      id: 'record-1',
      storeId: 'store-1',
      storeName: '西友',
      priceAmount: 300,
      unitPriceAmount: 100,
      packageSizeValue: 3,
      packageSizeUnit: '個',
      observedAt: '2026-01-03T00:00:00.000Z',
    });
  });

  it('storeMap に該当 store が無い場合は storeName を空文字へ縮退する', () => {
    const dto = toProductDto(
      buildProduct([buildPriceRecord(StoreId.fromString('store-unknown'))]),
      new Map(),
    );

    expect(dto.priceHistory[0]?.storeId).toBe('store-unknown');
    expect(dto.priceHistory[0]?.storeName).toBe('');
  });
});
