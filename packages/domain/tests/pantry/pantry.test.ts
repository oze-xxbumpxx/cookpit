import { describe, expect, it } from 'vitest';
import { ProductId } from '../../src/product/product-id';
import { Quantity } from '../../src/shared/quantity';
import { ShoppingItemId } from '../../src/shopping-list/shopping-item-id';
import { PantryId } from '../../src/pantry/pantry-id';
import type { CreateStockInput, StockProps } from '../../src/pantry/pantry';
import { Pantry, Stock } from '../../src/pantry/pantry';
import { StockId } from '../../src/pantry/stock-id';

function createStockInput(overrides: Partial<CreateStockInput> = {}): CreateStockInput {
  return {
    productId: ProductId.fromString('product-1'),
    displayName: '玉ねぎ',
    amount: Quantity.of(3, '個'),
    purchasedAt: new Date('2026-07-11T01:00:00.000Z'),
    expiresAt: new Date('2026-07-20T00:00:00.000Z'),
    storedLocation: 'fridge',
    sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-1'),
    ...overrides,
  };
}

function reconstructStock(overrides: Partial<StockProps> = {}): Stock {
  return Stock.reconstruct({
    id: StockId.fromString('stock-1'),
    ...createStockInput(),
    ...overrides,
  });
}

describe('Stock', () => {
  it('create は入力された全フィールドを設定する', () => {
    const input = createStockInput();
    const stock = Stock.create(input);

    expect(stock.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(stock.productId?.value).toBe('product-1');
    expect(stock.displayName).toBe(input.displayName);
    expect(stock.amount).toBe(input.amount);
    expect(stock.purchasedAt).toEqual(input.purchasedAt);
    expect(stock.expiresAt).toEqual(input.expiresAt);
    expect(stock.storedLocation).toBe(input.storedLocation);
    expect(stock.sourceShoppingItemId?.value).toBe('shopping-item-1');
  });

  it('create は nullable な全フィールドが null でも生成できる', () => {
    const stock = Stock.create(
      createStockInput({
        productId: null,
        expiresAt: null,
        storedLocation: null,
        sourceShoppingItemId: null,
      }),
    );

    expect(stock.productId).toBeNull();
    expect(stock.expiresAt).toBeNull();
    expect(stock.storedLocation).toBeNull();
    expect(stock.sourceShoppingItemId).toBeNull();
  });

  it('create は displayName が空白のみの場合を拒否する', () => {
    expect(() => Stock.create(createStockInput({ displayName: '   ' }))).toThrow(
      'Display name is required',
    );
  });

  it('create は amount が 0 の場合を拒否する', () => {
    expect(() => Stock.create(createStockInput({ amount: Quantity.of(0, '個') }))).toThrow(
      'Stock amount must be positive',
    );
  });

  it('reconstruct は amount が 0 でも入力どおり復元する', () => {
    const stock = reconstructStock({ amount: Quantity.of(0, '個') });

    expect(stock.amount.value).toBe(0);
    expect(stock.isEmpty()).toBe(true);
  });

  it('consume は在庫量より少ない同一単位の量を減算する', () => {
    const stock = reconstructStock({ amount: Quantity.of(300, 'g') });

    stock.consume(Quantity.of(100, 'g'));

    expect(stock.amount.value).toBe(200);
    expect(stock.amount.unit).toBe('g');
    expect(stock.isEmpty()).toBe(false);
  });

  it('consume は現在量と同じ量を 0 にクランプする', () => {
    const stock = reconstructStock({ amount: Quantity.of(200, 'g') });

    stock.consume(Quantity.of(200, 'g'));

    expect(stock.amount.value).toBe(0);
    expect(stock.isEmpty()).toBe(true);
  });

  it('consume は現在量を超える量を 0 にクランプする', () => {
    const stock = reconstructStock({ amount: Quantity.of(200, 'g') });

    stock.consume(Quantity.of(300, 'g'));

    expect(stock.amount.value).toBe(0);
    expect(stock.isEmpty()).toBe(true);
  });

  it('consume は単位が異なる場合を拒否する', () => {
    const stock = reconstructStock({ amount: Quantity.of(200, 'g') });

    expect(() => stock.consume(Quantity.of(1, '個'))).toThrow(
      'Cannot consume with a different unit',
    );
    expect(stock.amount.value).toBe(200);
  });

  it('isEmpty は amount が 0 で true、正数で false を返す', () => {
    expect(reconstructStock({ amount: Quantity.of(0, '個') }).isEmpty()).toBe(true);
    expect(reconstructStock({ amount: Quantity.of(1, '個') }).isEmpty()).toBe(false);
  });

  it('purchasedAt getter は防御的コピーを返す', () => {
    const stock = reconstructStock();
    const purchasedAt = stock.purchasedAt;

    purchasedAt.setFullYear(2099);

    expect(stock.purchasedAt.getFullYear()).toBe(2026);
  });

  it('expiresAt getter は防御的コピーを返す', () => {
    const stock = reconstructStock();
    const expiresAt = stock.expiresAt;

    expiresAt?.setFullYear(2099);

    expect(stock.expiresAt?.getFullYear()).toBe(2026);
  });
});

describe('Pantry', () => {
  it('create は singleton ID と空の在庫で生成する', () => {
    const pantry = Pantry.create();

    expect(pantry.id.equals(PantryId.singleton())).toBe(true);
    expect(pantry.stocks).toEqual([]);
  });

  it('reconstruct は入力された ID と在庫を復元する', () => {
    const id = PantryId.fromString('pantry-1');
    const stock = reconstructStock();
    const pantry = Pantry.reconstruct({ id, stocks: [stock] });

    expect(pantry.id.equals(id)).toBe(true);
    expect(pantry.stocks).toEqual([stock]);
  });

  it('addStock は Stock を追加して発行した ID を返す', () => {
    const pantry = Pantry.create();

    const stockId = pantry.addStock(createStockInput());

    expect(pantry.stocks).toHaveLength(1);
    expect(pantry.stocks[0]?.id.equals(stockId)).toBe(true);
  });

  it('consumeStock は在庫量を減らし、残量があれば Stock を残す', () => {
    const stock = reconstructStock({ amount: Quantity.of(300, 'g') });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    pantry.consumeStock(stock.id, Quantity.of(100, 'g'));

    expect(pantry.stocks).toHaveLength(1);
    expect(pantry.stocks[0]?.amount.value).toBe(200);
  });

  it('consumeStock は残量が 0 になった Stock を削除する', () => {
    const stock = reconstructStock({ amount: Quantity.of(200, 'g') });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    pantry.consumeStock(stock.id, Quantity.of(200, 'g'));

    expect(pantry.stocks).toEqual([]);
  });

  it('consumeStock は過剰消費でも Stock を削除する', () => {
    const stock = reconstructStock({ amount: Quantity.of(200, 'g') });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    pantry.consumeStock(stock.id, Quantity.of(300, 'g'));

    expect(pantry.stocks).toEqual([]);
  });

  it('consumeStock は存在しない Stock を拒否する', () => {
    const pantry = Pantry.create();

    expect(() => pantry.consumeStock(StockId.fromString('missing'), Quantity.of(1, '個'))).toThrow(
      'Stock not found',
    );
  });

  it('discardStock は残量に関わらず対象 Stock を削除する', () => {
    const target = reconstructStock({ amount: Quantity.of(500, 'g') });
    const remaining = reconstructStock({ id: StockId.fromString('stock-2') });
    const pantry = Pantry.reconstruct({
      id: PantryId.singleton(),
      stocks: [target, remaining],
    });

    pantry.discardStock(target.id);

    expect(pantry.stocks).toEqual([remaining]);
  });

  it('discardStock は存在しない Stock を拒否する', () => {
    const pantry = Pantry.create();

    expect(() => pantry.discardStock(StockId.fromString('missing'))).toThrow('Stock not found');
  });

  it('hasStockFromShoppingItem は一致する由来 ID があれば true を返す', () => {
    const stock = reconstructStock({
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-1'),
    });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    expect(pantry.hasStockFromShoppingItem(ShoppingItemId.fromString('shopping-item-1'))).toBe(
      true,
    );
  });

  it('hasStockFromShoppingItem は由来 ID が null の Stock だけなら false を返す', () => {
    const stock = reconstructStock({ sourceShoppingItemId: null });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    expect(pantry.hasStockFromShoppingItem(ShoppingItemId.fromString('shopping-item-1'))).toBe(
      false,
    );
  });

  it('hasStockFromShoppingItem は由来 ID が一致しなければ false を返す', () => {
    const stock = reconstructStock({
      sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-1'),
    });
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });

    expect(pantry.hasStockFromShoppingItem(ShoppingItemId.fromString('shopping-item-2'))).toBe(
      false,
    );
  });

  it('stocks getter は防御的コピーを返す', () => {
    const stock = reconstructStock();
    const pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks: [stock] });
    const stocks = pantry.stocks;

    stocks.push(reconstructStock({ id: StockId.fromString('stock-2') }));

    expect(pantry.stocks).toEqual([stock]);
  });
});
