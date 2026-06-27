import { describe, expect, it } from 'vitest';
import { Money } from '../shared/money';
import { Quantity } from '../shared/quantity';
import { StoreId } from '../shared/store';
import { PriceRecordId } from './price-record-id';
import { PriceRecord, Product } from './product';
import { ProductId } from './product-id';
import type { PriceRecordProps, ProductProps } from './product';

const createProduct = (): Product =>
  Product.create({
    name: '玉ねぎ',
    aliases: ['タマネギ'],
    category: '野菜',
    defaultUnit: '個',
  });

const createPriceRecord = (
  idValue: string,
  storeId: StoreId,
  unitPriceAmount: number,
  observedAt: Date,
  priceAmount: number = 300,
): PriceRecord =>
  PriceRecord.create({
    id: PriceRecordId.fromString(idValue),
    storeId,
    price: Money.of(priceAmount, 'JPY'),
    unitPrice: Money.of(unitPriceAmount, 'JPY'),
    packageSize: Quantity.of(3, '個'),
    observedAt,
  });

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

describe('PriceRecord', () => {
  it('create で価格記録を生成する (PR1)', () => {
    const observedAt = new Date('2026-01-01T00:00:00.000Z');
    const storeId = StoreId.fromString('store-1');
    const record = createPriceRecord('price-record-1', storeId, 100, observedAt);

    expect(record.id.value).toBe('price-record-1');
    expect(record.storeId.equals(storeId)).toBe(true);
    expect(record.price.amount).toBe(300);
    expect(record.unitPrice.amount).toBe(100);
    expect(record.packageSize.value).toBe(3);
    expect(record.observedAt.toISOString()).toBe(observedAt.toISOString());
  });

  it('observedAt は防御的コピーで保持する (PR2)', () => {
    const observedAt = new Date('2026-01-01T00:00:00.000Z');
    const record = createPriceRecord(
      'price-record-1',
      StoreId.fromString('store-1'),
      100,
      observedAt,
    );

    observedAt.setFullYear(2030);
    expect(record.observedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reconstruct は props の値を保持して復元する (PR3)', () => {
    const props: PriceRecordProps = {
      id: PriceRecordId.fromString('price-record-1'),
      storeId: StoreId.fromString('store-1'),
      price: Money.of(250, 'JPY'),
      unitPrice: Money.of(83.3, 'JPY'),
      packageSize: Quantity.of(3, '個'),
      observedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const record = PriceRecord.reconstruct(props);
    expect(record.id.value).toBe('price-record-1');
    expect(record.unitPrice.amount).toBe(83.3);
  });

  it('create は 0 円の価格を拒否する (PR4)', () => {
    expect(() =>
      PriceRecord.create({
        id: PriceRecordId.fromString('price-record-1'),
        storeId: StoreId.fromString('store-1'),
        price: Money.of(0, 'JPY'),
        unitPrice: Money.of(100, 'JPY'),
        packageSize: Quantity.of(3, '個'),
        observedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toThrow('Price record price must be positive');
  });

  it('create は 0 円の単価を拒否する (PR5)', () => {
    expect(() =>
      PriceRecord.create({
        id: PriceRecordId.fromString('price-record-1'),
        storeId: StoreId.fromString('store-1'),
        price: Money.of(300, 'JPY'),
        unitPrice: Money.of(0, 'JPY'),
        packageSize: Quantity.of(3, '個'),
        observedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toThrow('Price record unit price must be positive');
  });

  it('create は 0 の内容量を拒否する (PR6)', () => {
    expect(() =>
      PriceRecord.create({
        id: PriceRecordId.fromString('price-record-1'),
        storeId: StoreId.fromString('store-1'),
        price: Money.of(300, 'JPY'),
        unitPrice: Money.of(100, 'JPY'),
        packageSize: Quantity.of(0, '個'),
        observedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toThrow('Price record package size must be positive');
  });
});

describe('Product.create', () => {
  it('正常に商品を生成する (P1)', () => {
    const product = createProduct();
    expect(product.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(product.name).toBe('玉ねぎ');
    expect(product.aliases).toEqual(['タマネギ']);
    expect(product.category).toBe('野菜');
    expect(product.defaultUnit).toBe('個');
    expect(product.priceHistory).toEqual([]);
  });

  it('名前が空白なら拒否する (P2)', () => {
    expect(() =>
      Product.create({
        name: '  ',
        aliases: [],
        category: 'その他',
        defaultUnit: '個',
      }),
    ).toThrow('Product name is required');
  });

  it('独自カテゴリを許容する (P15)', () => {
    const product = Product.create({
      name: 'はちみつ',
      aliases: [],
      category: '嗜好品',
      defaultUnit: '個',
    });

    expect(product.category).toBe('嗜好品');
  });
});

describe('Product の状態変更', () => {
  it('update は商品情報を更新する (P3)', () => {
    const product = createProduct();
    product.update({
      name: 'にんじん',
      aliases: ['人参'],
      category: '野菜',
      defaultUnit: '本',
    });

    expect(product.name).toBe('にんじん');
    expect(product.aliases).toEqual(['人参']);
    expect(product.defaultUnit).toBe('本');
  });

  it('update は空白の名前を拒否する (P4)', () => {
    const product = createProduct();
    expect(() =>
      product.update({
        name: '  ',
        aliases: [],
        category: 'その他',
        defaultUnit: '個',
      }),
    ).toThrow('Product name is required');
  });

  it('recordPrice は価格履歴を追加する (P5)', () => {
    const product = createProduct();
    const record = createPriceRecord(
      'price-record-1',
      StoreId.fromString('store-1'),
      100,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    product.recordPrice(record);

    expect(product.priceHistory).toEqual([record]);
  });

  it('ゲッターは防御的コピーを返し内部状態を保護する (P6)', () => {
    const product = createProduct();
    product.aliases.push('玉葱');
    product.priceHistory.push(
      createPriceRecord(
        'price-record-1',
        StoreId.fromString('store-1'),
        100,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    );

    expect(product.aliases).toEqual(['タマネギ']);
    expect(product.priceHistory).toEqual([]);
  });
});

describe('Product.latestPriceAt', () => {
  it('単一の最新価格を返す (P7)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    const record = createPriceRecord(
      'price-record-1',
      storeId,
      100,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    product.recordPrice(record);

    expect(product.latestPriceAt(storeId)?.amount).toBe(300);
  });

  it('複数記録では最新価格を返す (P8)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(
      createPriceRecord('old-record', storeId, 100, new Date('2026-01-01T00:00:00.000Z'), 300),
    );
    product.recordPrice(
      createPriceRecord('new-record', storeId, 90, new Date('2026-01-02T00:00:00.000Z'), 270),
    );

    expect(product.latestPriceAt(storeId)?.amount).toBe(270);
  });

  it('対象店舗の価格記録がなければ null を返す (P9)', () => {
    const product = createProduct();
    expect(product.latestPriceAt(StoreId.fromString('missing-store'))).toBeNull();
  });
});

describe('Product.latestPriceRecordAt', () => {
  it('複数記録では最新の価格記録を返す (P16)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(
      createPriceRecord('old-record', storeId, 100, new Date('2026-01-01T00:00:00.000Z')),
    );
    product.recordPrice(
      createPriceRecord('new-record', storeId, 90, new Date('2026-01-02T00:00:00.000Z')),
    );

    expect(product.latestPriceRecordAt(storeId)?.id.value).toBe('new-record');
  });
});

describe('Product.cheapestStoreAt', () => {
  it('記録がなければ null を返す (P10)', () => {
    expect(createProduct().cheapestStoreAt(new Date('2026-01-01T00:00:00.000Z'))).toBeNull();
  });

  it('単一店舗ならその店舗を返す (P11)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(
      createPriceRecord('price-record-1', storeId, 100, new Date('2026-01-01T00:00:00.000Z')),
    );

    expect(product.cheapestStoreAt(new Date('2026-01-02T00:00:00.000Z'))?.equals(storeId)).toBe(
      true,
    );
  });

  it('複数店舗では指定時点の最新価格から最安店舗を返す (P12)', () => {
    const product = createProduct();
    const storeA = StoreId.fromString('store-a');
    const storeB = StoreId.fromString('store-b');
    product.recordPrice(
      createPriceRecord('record-a', storeA, 90, new Date('2026-01-01T00:00:00.000Z')),
    );
    product.recordPrice(
      createPriceRecord('record-b', storeB, 80, new Date('2026-01-01T00:00:00.000Z')),
    );

    expect(product.cheapestStoreAt(new Date('2026-01-02T00:00:00.000Z'))?.equals(storeB)).toBe(
      true,
    );
  });

  it('指定時点より未来の価格記録は最安判定に使わない (P13)', () => {
    const product = createProduct();
    const storeA = StoreId.fromString('store-a');
    const storeB = StoreId.fromString('store-b');
    product.recordPrice(
      createPriceRecord('record-a', storeA, 90, new Date('2026-01-01T00:00:00.000Z')),
    );
    product.recordPrice(
      createPriceRecord('future-record-b', storeB, 80, new Date('2026-01-03T00:00:00.000Z')),
    );

    expect(product.cheapestStoreAt(new Date('2026-01-02T00:00:00.000Z'))?.equals(storeA)).toBe(
      true,
    );
  });
});

describe('Product.averagePrice', () => {
  it('対象期間の価格平均を返す (P17)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(createPriceRecord('record-1', storeId, 100, daysAgo(1), 200));
    product.recordPrice(createPriceRecord('record-2', storeId, 100, daysAgo(2), 300));
    product.recordPrice(createPriceRecord('old-record', storeId, 100, daysAgo(40), 900));

    expect(product.averagePrice(storeId, 30)?.amount).toBe(250);
  });

  it('対象期間の価格記録がなければ null を返す (P18)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(createPriceRecord('old-record', storeId, 100, daysAgo(40), 900));

    expect(product.averagePrice(storeId, 30)).toBeNull();
  });

  it('periodDays が 0 以下なら拒否する (P19)', () => {
    expect(() => createProduct().averagePrice(StoreId.fromString('store-1'), 0)).toThrow(
      'Period days must be positive',
    );
  });
});

describe('Product.isPriceLow', () => {
  it('現在価格が 90 日平均より安ければ true を返す (P20)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(createPriceRecord('record-1', storeId, 100, daysAgo(1), 200));
    product.recordPrice(createPriceRecord('record-2', storeId, 100, daysAgo(2), 300));

    expect(product.isPriceLow(storeId, Money.of(200, 'JPY'))).toBe(true);
  });

  it('現在価格が 90 日平均以上なら false を返す (P21)', () => {
    const product = createProduct();
    const storeId = StoreId.fromString('store-1');
    product.recordPrice(createPriceRecord('record-1', storeId, 100, daysAgo(1), 200));
    product.recordPrice(createPriceRecord('record-2', storeId, 100, daysAgo(2), 300));

    expect(product.isPriceLow(storeId, Money.of(250, 'JPY'))).toBe(false);
  });

  it('平均価格がなければ false を返す (P22)', () => {
    expect(createProduct().isPriceLow(StoreId.fromString('store-1'), Money.of(200, 'JPY'))).toBe(
      false,
    );
  });
});

describe('Product.reconstruct', () => {
  it('props の値を保持して復元する (P14)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const priceRecord = createPriceRecord(
      'price-record-1',
      StoreId.fromString('store-1'),
      100,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const props: ProductProps = {
      id: ProductId.fromString('product-1'),
      name: '玉ねぎ',
      aliases: ['タマネギ'],
      category: '野菜',
      defaultUnit: '個',
      priceHistory: [priceRecord],
      createdAt,
      updatedAt,
    };

    const product = Product.reconstruct(props);
    expect(product.id.value).toBe('product-1');
    expect(product.name).toBe('玉ねぎ');
    expect(product.aliases).toEqual(['タマネギ']);
    expect(product.priceHistory).toEqual([priceRecord]);
    expect(product.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(product.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });
});
