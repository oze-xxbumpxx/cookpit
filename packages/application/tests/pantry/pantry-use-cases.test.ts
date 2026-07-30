import {
  Pantry,
  PantryId,
  ProductId,
  Quantity,
  ShoppingItemId,
  Stock,
  StockId,
} from '@cookpit/domain';
import type { PantryRepository } from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddStockUseCase } from '../../src/pantry/add-stock.use-case';
import { ConsumeStockUseCase } from '../../src/pantry/consume-stock.use-case';
import { DiscardStockUseCase } from '../../src/pantry/discard-stock.use-case';
import { GetPantryUseCase } from '../../src/pantry/get-pantry.use-case';
import { InvalidStockOperationError } from '../../src/pantry/invalid-stock-operation.error';
import { StockNotFoundError } from '../../src/pantry/stock-not-found.error';

const STOCK_ID = 'stock-1';
const PRODUCT_ID = 'product-1';

class InMemoryPantryRepository implements PantryRepository {
  private pantry = Pantry.create();
  public saveCount = 0;

  async find(): Promise<Pantry> {
    return this.pantry;
  }

  async save(pantry: Pantry): Promise<void> {
    this.saveCount += 1;
    this.pantry = pantry;
  }

  seed(pantry: Pantry): void {
    this.pantry = pantry;
  }
}

interface SeededStockOptions {
  id?: string;
  displayName?: string;
  value?: number;
  unit?: 'g' | '個';
  purchasedAt?: Date;
}

function seededStock(options: SeededStockOptions = {}): Stock {
  return Stock.reconstruct({
    id: StockId.fromString(options.id ?? STOCK_ID),
    productId: ProductId.fromString(PRODUCT_ID),
    displayName: options.displayName ?? '玉ねぎ',
    amount: Quantity.of(options.value ?? 300, options.unit ?? 'g'),
    purchasedAt: options.purchasedAt ?? new Date('2026-07-11T09:00:00.000Z'),
    expiresAt: null,
    storedLocation: null,
    sourceShoppingItemId: ShoppingItemId.fromString(`item-${options.id ?? STOCK_ID}`),
  });
}

function seededPantry(stocks: Stock[]): Pantry {
  return Pantry.reconstruct({ id: PantryId.singleton(), stocks });
}

let pantryRepository: InMemoryPantryRepository;

beforeEach(() => {
  pantryRepository = new InMemoryPantryRepository();
});

describe('ConsumeStockUseCase', () => {
  it('単位が一致する在庫を消費し、更新後の PantryDto を返す', async () => {
    pantryRepository.seed(seededPantry([seededStock()]));

    const result = await new ConsumeStockUseCase(pantryRepository).execute({
      stockId: STOCK_ID,
      amount: { value: 100, unit: 'g' },
    });

    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0]?.amount).toEqual({ value: 200, unit: 'g' });
    expect(pantryRepository.saveCount).toBe(1);
  });

  it('全量以上を消費すると対象 Stock を削除する', async () => {
    pantryRepository.seed(seededPantry([seededStock({ value: 200 })]));
    const useCase = new ConsumeStockUseCase(pantryRepository);

    const exactResult = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 200, unit: 'g' },
    });

    expect(exactResult).toEqual({ stocks: [] });

    pantryRepository.seed(seededPantry([seededStock({ value: 200 })]));
    const excessiveResult = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 999, unit: 'g' },
    });

    expect(excessiveResult).toEqual({ stocks: [] });
  });

  it('対象 Stock が存在しない場合は StockNotFoundError を投げる', async () => {
    await expect(
      new ConsumeStockUseCase(pantryRepository).execute({
        stockId: 'missing-stock',
        amount: { value: 1, unit: '個' },
      }),
    ).rejects.toEqual(new StockNotFoundError('missing-stock'));
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('単位が一致しない場合は expected と got を含む InvalidStockOperationError を投げる', async () => {
    pantryRepository.seed(seededPantry([seededStock()]));

    await expect(
      new ConsumeStockUseCase(pantryRepository).execute({
        stockId: STOCK_ID,
        amount: { value: 1, unit: '個' },
      }),
    ).rejects.toEqual(new InvalidStockOperationError('Unit mismatch: expected g, got 個'));
    expect(pantryRepository.saveCount).toBe(0);
  });
});

describe('DiscardStockUseCase', () => {
  it('残量に関わらず対象 Stock を全量削除する', async () => {
    pantryRepository.seed(
      seededPantry([
        seededStock({ value: 500 }),
        seededStock({ id: 'stock-2', displayName: '人参', value: 2, unit: '個' }),
      ]),
    );

    const result = await new DiscardStockUseCase(pantryRepository).execute({ stockId: STOCK_ID });

    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0]?.id).toBe('stock-2');
    expect(pantryRepository.saveCount).toBe(1);
  });

  it('対象 Stock が存在しない場合は StockNotFoundError を投げる', async () => {
    await expect(
      new DiscardStockUseCase(pantryRepository).execute({ stockId: 'missing-stock' }),
    ).rejects.toEqual(new StockNotFoundError('missing-stock'));
    expect(pantryRepository.saveCount).toBe(0);
  });
});

describe('AddStockUseCase', () => {
  it('在庫を 1 件追加し、productId は null・任意項目つきで更新後 PantryDto を返す', async () => {
    const result = await new AddStockUseCase(pantryRepository).execute({
      displayName: '玉ねぎ',
      amount: { value: 3, unit: '個' },
      storedLocation: 'fridge',
      expiresAt: '2026-07-31',
    });

    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0]).toMatchObject({
      productId: null,
      displayName: '玉ねぎ',
      amount: { value: 3, unit: '個' },
      storedLocation: 'fridge',
      expiresAt: '2026-07-31',
    });
    expect(pantryRepository.saveCount).toBe(1);
  });

  it('既存在庫に加算せず新規 Stock として追加する（追加＝常に新規）', async () => {
    pantryRepository.seed(seededPantry([seededStock({ value: 300, unit: 'g' })]));

    const result = await new AddStockUseCase(pantryRepository).execute({
      displayName: '玉ねぎ',
      amount: { value: 2, unit: '個' },
      storedLocation: null,
      expiresAt: null,
    });

    expect(result.stocks).toHaveLength(2);
  });

  it('storedLocation / expiresAt が null でも追加できる', async () => {
    const result = await new AddStockUseCase(pantryRepository).execute({
      displayName: '塩',
      amount: { value: 1, unit: '袋' },
      storedLocation: null,
      expiresAt: null,
    });

    expect(result.stocks[0]).toMatchObject({
      storedLocation: null,
      expiresAt: null,
    });
  });

  it('displayName が空白のみの場合は InvalidStockOperationError を投げ save しない', async () => {
    await expect(
      new AddStockUseCase(pantryRepository).execute({
        displayName: '   ',
        amount: { value: 1, unit: '個' },
        storedLocation: null,
        expiresAt: null,
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('amount が 0 以下の場合は InvalidStockOperationError を投げ save しない', async () => {
    await expect(
      new AddStockUseCase(pantryRepository).execute({
        displayName: '玉ねぎ',
        amount: { value: 0, unit: '個' },
        storedLocation: null,
        expiresAt: null,
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(pantryRepository.saveCount).toBe(0);
  });
});

describe('GetPantryUseCase', () => {
  it('空 Pantry でも例外を投げず空の PantryDto を返す', async () => {
    await expect(new GetPantryUseCase(pantryRepository).execute()).resolves.toEqual({ stocks: [] });
  });

  it('複数 Stock を DTO に変換して全件返す', async () => {
    pantryRepository.seed(
      seededPantry([
        seededStock(),
        Stock.reconstruct({
          id: StockId.fromString('stock-2'),
          productId: null,
          displayName: '塩',
          amount: Quantity.of(1, '個'),
          purchasedAt: new Date('2026-07-12T09:00:00.000Z'),
          expiresAt: new Date(2026, 6, 20),
          storedLocation: 'pantry',
          sourceShoppingItemId: null,
        }),
      ]),
    );

    const result = await new GetPantryUseCase(pantryRepository).execute();

    expect(result.stocks).toHaveLength(2);
    expect(result.stocks[1]).toMatchObject({
      id: 'stock-2',
      productId: null,
      displayName: '塩',
      amount: { value: 1, unit: '個' },
      expiresAt: '2026-07-20',
      storedLocation: 'pantry',
    });
  });
});

describe('Pantry Application errors', () => {
  it('エラー名とメッセージを公開契約どおり設定する', () => {
    const notFound = new StockNotFoundError(STOCK_ID);
    const invalidOperation = new InvalidStockOperationError('invalid operation');

    expect(notFound.name).toBe('StockNotFoundError');
    expect(notFound.message).toBe(`Stock not found: ${STOCK_ID}`);
    expect(invalidOperation.name).toBe('InvalidStockOperationError');
    expect(invalidOperation.message).toBe('invalid operation');
  });
});
