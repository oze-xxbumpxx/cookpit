import {
  Pantry,
  PantryId,
  ProductId,
  Quantity,
  ShoppingItemId,
  Stock,
  StockId,
} from '@cookpit/domain';
import type { StockProps } from '@cookpit/domain';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DrizzleClient } from '../../src/db/client';
import { stocks } from '../../src/db/schema';
import { createTestDb, DrizzleUnitOfWork } from '../testing/create-test-db';
import { DrizzlePantryRepository } from '../../src/repositories/drizzle-pantry.repository';

const PURCHASED_AT = new Date('2026-07-11T10:00:00');

function createStock(overrides: Partial<StockProps> = {}): Stock {
  return Stock.reconstruct({
    id: StockId.fromString('stock-1'),
    productId: ProductId.fromString('product-1'),
    displayName: '玉ねぎ',
    amount: Quantity.of(2.5, '個'),
    purchasedAt: PURCHASED_AT,
    expiresAt: new Date('2026-07-18T00:00:00'),
    storedLocation: 'fridge',
    sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-1'),
    ...overrides,
  });
}

function createPantry(stocksValue: Stock[]): Pantry {
  return Pantry.reconstruct({ id: PantryId.singleton(), stocks: stocksValue });
}

function requireStock(stock: Stock | undefined): Stock {
  if (stock === undefined) {
    throw new Error('Expected stock in test');
  }
  return stock;
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('DrizzlePantryRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzlePantryRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
  });

  it('空 DB で find() は空の Pantry を返す', async () => {
    const found = await repository.find();

    expect(found.id.equals(PantryId.singleton())).toBe(true);
    expect(found.stocks).toEqual([]);
  });

  it('save() → find() で全フィールドを復元する', async () => {
    const original = createStock();
    await repository.save(createPantry([original]));

    const found = requireStock((await repository.find()).stocks[0]);
    expect(found.id.equals(original.id)).toBe(true);
    expect(found.productId?.value).toBe('product-1');
    expect(found.displayName).toBe('玉ねぎ');
    expect(found.amount.value).toBe(2.5);
    expect(found.amount.unit).toBe('個');
    expect(found.purchasedAt).toEqual(PURCHASED_AT);
    expect(toLocalDateString(requireDate(found.expiresAt))).toBe('2026-07-18');
    expect(found.storedLocation).toBe('fridge');
    expect(found.sourceShoppingItemId?.value).toBe('shopping-item-1');
  });

  it('nullable フィールドがすべて null の Stock を往復できる', async () => {
    const original = createStock({
      productId: null,
      expiresAt: null,
      storedLocation: null,
      sourceShoppingItemId: null,
    });
    await repository.save(createPantry([original]));

    const found = requireStock((await repository.find()).stocks[0]);
    expect(found.productId).toBeNull();
    expect(found.expiresAt).toBeNull();
    expect(found.storedLocation).toBeNull();
    expect(found.sourceShoppingItemId).toBeNull();
  });

  it('同一 sourceShoppingItemId の Stock は UNIQUE 制約により保存できない', async () => {
    const sourceShoppingItemId = ShoppingItemId.fromString('shopping-item-1');
    const first = createStock({ sourceShoppingItemId });
    const second = createStock({
      id: StockId.fromString('stock-2'),
      sourceShoppingItemId,
    });

    await expect(repository.save(createPantry([first, second]))).rejects.toThrow();
  });

  it('同一 id の再 save() は編集対象 4 列を更新し、対象外フィールドは維持する', async () => {
    const original = createStock();
    await repository.save(createPantry([original]));

    const changed = createStock({
      productId: ProductId.fromString('product-changed'),
      displayName: '変更後',
      amount: Quantity.of(1.25, 'g'),
      purchasedAt: new Date('2026-07-12T10:00:00'),
      expiresAt: new Date('2026-07-19T00:00:00'),
      storedLocation: 'freezer',
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-changed'),
    });
    await repository.save(createPantry([changed]));

    const rows = await db.select().from(stocks).where(eq(stocks.id, original.id.value));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.productId).toBe('product-1');
    expect(rows[0]?.displayName).toBe('玉ねぎ');
    expect(Number(rows[0]?.amountValue)).toBe(1.25);
    expect(rows[0]?.amountUnit).toBe('g');
    expect(rows[0]?.purchasedAt).toEqual(PURCHASED_AT);
    expect(rows[0]?.expiresAt).toBe('2026-07-19');
    expect(rows[0]?.storedLocation).toBe('freezer');
    expect(rows[0]?.sourceShoppingItemId).toBe('shopping-item-1');
  });

  it('再 save() で数量の値を据え置き、単位のみ変更できる', async () => {
    await repository.save(createPantry([createStock()]));
    await repository.save(createPantry([createStock({ amount: Quantity.of(2.5, 'g') })]));

    const reloadedRepository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
    const found = requireStock((await reloadedRepository.find()).stocks[0]);
    expect(found.amount.value).toBe(2.5);
    expect(found.amount.unit).toBe('g');
  });

  it('再 save() で数量の値・単位・賞味期限・保存場所を同時に変更できる', async () => {
    await repository.save(createPantry([createStock()]));
    await repository.save(
      createPantry([
        createStock({
          amount: Quantity.of(1.25, 'g'),
          expiresAt: new Date('2026-07-19T00:00:00'),
          storedLocation: 'freezer',
        }),
      ]),
    );

    const reloadedRepository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
    const found = requireStock((await reloadedRepository.find()).stocks[0]);
    expect(found.amount.value).toBe(1.25);
    expect(found.amount.unit).toBe('g');
    expect(toLocalDateString(requireDate(found.expiresAt))).toBe('2026-07-19');
    expect(found.storedLocation).toBe('freezer');
  });

  it('再 save() で賞味期限を null にクリアできる', async () => {
    await repository.save(createPantry([createStock()]));
    await repository.save(createPantry([createStock({ expiresAt: null })]));

    const reloadedRepository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
    const found = requireStock((await reloadedRepository.find()).stocks[0]);
    expect(found.expiresAt).toBeNull();
  });

  it('再 save() で保存場所を null にクリアできる', async () => {
    await repository.save(createPantry([createStock()]));
    await repository.save(createPantry([createStock({ storedLocation: null })]));

    const reloadedRepository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
    const found = requireStock((await reloadedRepository.find()).stocks[0]);
    expect(found.storedLocation).toBeNull();
  });

  it('再 save() で null の賞味期限と保存場所に値を設定できる', async () => {
    await repository.save(createPantry([createStock({ expiresAt: null, storedLocation: null })]));
    await repository.save(
      createPantry([
        createStock({
          expiresAt: new Date('2026-07-19T00:00:00'),
          storedLocation: 'freezer',
        }),
      ]),
    );

    const reloadedRepository = new DrizzlePantryRepository(new DrizzleUnitOfWork(db));
    const found = requireStock((await reloadedRepository.find()).stocks[0]);
    expect(toLocalDateString(requireDate(found.expiresAt))).toBe('2026-07-19');
    expect(found.storedLocation).toBe('freezer');
  });

  it('再 save() で削除済み Stock を同期し、0 件では全削除する', async () => {
    const first = createStock();
    const second = createStock({
      id: StockId.fromString('stock-2'),
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-2'),
    });
    await repository.save(createPantry([first, second]));

    await repository.save(createPantry([second]));
    let rows = await db.select().from(stocks);
    expect(rows.map((row) => row.id)).toEqual(['stock-2']);

    await repository.save(createPantry([]));
    rows = await db.select().from(stocks);
    expect(rows).toHaveLength(0);
  });

  it('amountValue は number 型として復元される', async () => {
    await repository.save(createPantry([createStock()]));

    const found = requireStock((await repository.find()).stocks[0]);
    expect(typeof found.amount.value).toBe('number');
  });

  it('expiresAt はタイムゾーンによる日付ずれなく往復する', async () => {
    const expiresAt = new Date('2026-07-18T00:00:00');
    await repository.save(createPantry([createStock({ expiresAt })]));

    const found = requireStock((await repository.find()).stocks[0]);
    expect(toLocalDateString(requireDate(found.expiresAt))).toBe(toLocalDateString(expiresAt));
  });

  it('find() は purchasedAt 昇順で Stock を復元する', async () => {
    const later = createStock({
      id: StockId.fromString('stock-later'),
      purchasedAt: new Date('2026-07-12T10:00:00'),
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-later'),
    });
    const earlier = createStock({
      id: StockId.fromString('stock-earlier'),
      purchasedAt: new Date('2026-07-10T10:00:00'),
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-earlier'),
    });
    await repository.save(createPantry([later, earlier]));

    const found = await repository.find();
    expect(found.stocks.map((stock) => stock.id.value)).toEqual(['stock-earlier', 'stock-later']);
  });
});

function requireDate(date: Date | null): Date {
  if (date === null) {
    throw new Error('Expected date in test');
  }
  return date;
}
