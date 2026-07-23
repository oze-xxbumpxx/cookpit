import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PriceRecord, Product } from '@cookpit/domain/src/product/product';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { Store, StoreId } from '@cookpit/domain/src/shared/store';
import type { DrizzleClient } from '../db/client';
import { priceRecords, products } from '../db/schema';
import { createTestDb } from '../testing/create-test-db';
import { DrizzleProductRepository } from './drizzle-product.repository';
import { DrizzleStoreRepository } from './drizzle-store.repository';
import { toUnit } from './mappers';

function createProduct(overrides: { name?: string; aliases?: string[] } = {}): Product {
  return Product.create({
    name: overrides.name ?? 'トマト',
    aliases: overrides.aliases ?? ['プチトマト'],
    category: '野菜',
    defaultUnit: '個',
  });
}

function createPriceRecord(
  storeId: StoreId,
  overrides: { priceAmount?: number; observedAt?: Date } = {},
): PriceRecord {
  return PriceRecord.create({
    id: PriceRecordId.generate(),
    storeId,
    price: Money.of(overrides.priceAmount ?? 300, 'JPY'),
    unitPrice: Money.of(1.5, 'JPY'),
    packageSize: Quantity.of(200, 'g'),
    observedAt: overrides.observedAt ?? new Date('2026-06-01T00:00:00.000Z'),
  });
}

describe('DrizzleProductRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzleProductRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzleProductRepository(db);
  });

  async function insertStore(): Promise<Store> {
    const store = Store.create({ name: 'スーパーA' });
    await new DrizzleStoreRepository(db).save(store);
    return store;
  }

  it('IR-P-01: save() で product 行が挿入される', async () => {
    const product = createProduct();

    await repository.save(product);

    const rows = await db.select().from(products).where(eq(products.id, product.id.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('トマト');
  });

  it('IR-P-02: findById() で DB 行がドメイン Entity に復元される', async () => {
    const product = createProduct();
    await repository.save(product);

    const found = await repository.findById(product.id);

    expect(found).not.toBeNull();
    expect(found?.id.equals(product.id)).toBe(true);
    expect(found?.name).toBe('トマト');
    expect(found?.aliases).toEqual(['プチトマト']);
    expect(found?.category).toBe('野菜');
    expect(found?.defaultUnit).toBe('個');
  });

  it('IR-P-03: save() + findAll() ラウンドトリップで priceHistory の変換が正しい', async () => {
    const store = await insertStore();
    const product = createProduct();
    const record = createPriceRecord(store.id);
    product.recordPrice(record);
    await repository.save(product);

    const all = await repository.findAll();

    expect(all).toHaveLength(1);
    const history = all[0]?.priceHistory ?? [];
    expect(history).toHaveLength(1);
    const restored = history[0];
    expect(restored?.storeId.equals(store.id)).toBe(true);
    expect(typeof restored?.price.amount).toBe('number');
    expect(restored?.price.amount).toBe(300);
    expect(restored?.unitPrice.amount).toBe(1.5);
    expect(restored?.packageSize.value).toBe(200);
    expect(restored?.packageSize.unit).toBe('g');
    expect(restored?.observedAt.getTime()).toBe(record.observedAt.getTime());
  });

  it('IR-P-04: findById() で存在しない ID は null を返す', async () => {
    const found = await repository.findById(ProductId.generate());

    expect(found).toBeNull();
  });

  it('IR-P-05: delete() で product および関連 priceRecords が CASCADE で削除される', async () => {
    const store = await insertStore();
    const product = createProduct();
    product.recordPrice(createPriceRecord(store.id));
    await repository.save(product);

    await repository.delete(product.id);

    const productRows = await db.select().from(products);
    const priceRecordRows = await db.select().from(priceRecords);
    expect(productRows).toHaveLength(0);
    expect(priceRecordRows).toHaveLength(0);
  });

  it('IR-P-06: save() の upsert（onConflictDoUpdate）が既存行を上書きする', async () => {
    const product = createProduct();
    await repository.save(product);

    product.update({
      name: '完熟トマト',
      aliases: ['プチトマト', 'ミニトマト'],
      category: '野菜',
      defaultUnit: '袋',
    });
    await repository.save(product);

    const rows = await db.select().from(products);
    expect(rows).toHaveLength(1);
    const found = await repository.findById(product.id);
    expect(found?.name).toBe('完熟トマト');
    expect(found?.aliases).toEqual(['プチトマト', 'ミニトマト']);
    expect(found?.defaultUnit).toBe('袋');
  });

  it('IR-P-07: 複数 priceRecords が LEFT JOIN で 1 Product にグルーピングされる', async () => {
    const store = await insertStore();
    const product = createProduct();
    product.recordPrice(
      createPriceRecord(store.id, {
        priceAmount: 300,
        observedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    );
    product.recordPrice(
      createPriceRecord(store.id, {
        priceAmount: 280,
        observedAt: new Date('2026-06-15T00:00:00.000Z'),
      }),
    );
    await repository.save(product);

    const found = await repository.findById(product.id);

    expect(found).not.toBeNull();
    expect(found?.priceHistory).toHaveLength(2);
    const amounts = found?.priceHistory.map((record) => record.price.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([280, 300]);
  });

  it('IR-P-08: 複数 priceRecords のバッチ upsert は各行を自身の値で更新する', async () => {
    const store = await insertStore();
    const idA = PriceRecordId.generate();
    const idB = PriceRecordId.generate();

    const buildProduct = (amountA: number, amountB: number): Product =>
      Product.reconstruct({
        id: ProductId.fromString('product-batch-upsert'),
        name: 'トマト',
        aliases: [],
        category: '野菜',
        defaultUnit: '個',
        priceHistory: [
          PriceRecord.reconstruct({
            id: idA,
            storeId: store.id,
            price: Money.of(amountA, 'JPY'),
            unitPrice: Money.of(1.5, 'JPY'),
            packageSize: Quantity.of(200, 'g'),
            observedAt: new Date('2026-06-01T00:00:00.000Z'),
          }),
          PriceRecord.reconstruct({
            id: idB,
            storeId: store.id,
            price: Money.of(amountB, 'JPY'),
            unitPrice: Money.of(1.5, 'JPY'),
            packageSize: Quantity.of(200, 'g'),
            observedAt: new Date('2026-06-15T00:00:00.000Z'),
          }),
        ],
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });

    await repository.save(buildProduct(300, 280));
    // 同一 id で異なる値を再 save → ON CONFLICT の更新経路をバッチで通す。
    // excluded.* 参照が正しければ各行は自身の新しい値に更新される。
    await repository.save(buildProduct(350, 250));

    const found = await repository.findById(ProductId.fromString('product-batch-upsert'));
    const byId = new Map(
      found?.priceHistory.map((record) => [record.id.value, record.price.amount]),
    );
    expect(found?.priceHistory).toHaveLength(2);
    expect(byId.get(idA.value)).toBe(350);
    expect(byId.get(idB.value)).toBe(250);
  });

  it('INFRA-E-03: stores に存在しない storeId の priceRecord は FK 制約違反になる', async () => {
    const product = createProduct();
    product.recordPrice(createPriceRecord(StoreId.generate()));

    await expect(repository.save(product)).rejects.toThrow();
  });

  it('INFRA-B-03: aliases の空配列が text[] として正しく往復する', async () => {
    const product = createProduct({ aliases: [] });
    await repository.save(product);

    const found = await repository.findById(product.id);

    expect(found?.aliases).toEqual([]);
  });

  it('INFRA-B-04: priceHistory 0 件の Product は空配列で復元される', async () => {
    const product = createProduct();
    await repository.save(product);

    const found = await repository.findById(product.id);

    expect(found?.priceHistory).toEqual([]);
  });

  it('INFRA-B-05: numeric(10,1) の小数値が Number() 変換で正しく往復する', async () => {
    const store = await insertStore();
    const product = createProduct();
    product.recordPrice(createPriceRecord(store.id, { priceAmount: 98.5 }));
    await repository.save(product);

    const found = await repository.findById(product.id);

    expect(found?.priceHistory[0]?.price.amount).toBe(98.5);
  });
});

describe('toUnit', () => {
  it('INFRA-M-01: 全許容値がそのまま返る', () => {
    const units = [
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

    for (const unit of units) {
      expect(toUnit(unit)).toBe(unit);
    }
  });

  it('INFRA-M-02: 未知の unit 文字列は Error をスローする', () => {
    expect(() => toUnit('ダース')).toThrow('Unknown unit: ダース');
  });
});
