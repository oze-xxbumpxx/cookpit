import {
  Pantry,
  PantryId,
  ProductId,
  Quantity,
  ShoppingItemId,
  Stock,
  StockId,
} from '@cookpit/domain';
import type { PantryRepository, StockProps } from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidStockOperationError } from '../../src/pantry/invalid-stock-operation.error';
import type { PantryDto, StockDto, UpdateStockDetailsInputDto } from '../../src/pantry/pantry.dto';
import { StockNotFoundError } from '../../src/pantry/stock-not-found.error';
import { UpdateStockDetailsUseCase } from '../../src/pantry/update-stock-details.use-case';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

const STOCK_ID = 'stock-1';
const PURCHASED_AT = new Date('2026-08-01T09:00:00.000Z');

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

function createStock(overrides: Partial<StockProps> = {}): Stock {
  return Stock.reconstruct({
    id: StockId.fromString(STOCK_ID),
    productId: ProductId.fromString('product-1'),
    displayName: '玉ねぎ',
    amount: Quantity.of(2, '個'),
    purchasedAt: PURCHASED_AT,
    expiresAt: new Date('2026-08-10T00:00:00'),
    storedLocation: 'fridge',
    sourceShoppingItemId: ShoppingItemId.fromString('shopping-item-1'),
    ...overrides,
  });
}

function createPantry(stocks: Stock[]): Pantry {
  return Pantry.reconstruct({ id: PantryId.singleton(), stocks });
}

function requireStockDto(dto: PantryDto, stockId: string = STOCK_ID): StockDto {
  const stock = dto.stocks.find((candidate) => candidate.id === stockId) ?? null;
  if (stock === null) {
    throw new Error(`Expected StockDto: ${stockId}`);
  }
  return stock;
}

function requireStock(pantry: Pantry, stockId: string = STOCK_ID): Stock {
  const stock = pantry.stocks.find((candidate) => candidate.id.value === stockId) ?? null;
  if (stock === null) {
    throw new Error(`Expected Stock: ${stockId}`);
  }
  return stock;
}

describe('UpdateStockDetailsUseCase', () => {
  let pantryRepository: InMemoryPantryRepository;
  let useCase: UpdateStockDetailsUseCase;

  beforeEach(() => {
    pantryRepository = new InMemoryPantryRepository();
    useCase = new UpdateStockDetailsUseCase(pantryRepository, passthroughUnitOfWork);
  });

  it('A-UPD-01: 数量の値を更新し PantryDto を返して保存する', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 5, unit: '個' },
      expiresAt: '2026-08-10',
      storedLocation: 'fridge',
    });

    expect(requireStockDto(result).amount).toEqual({ value: 5, unit: '個' });
    expect(pantryRepository.saveCount).toBe(1);
  });

  it('A-UPD-02: 数量の値を据え置き、単位のみ変更する', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: 'g' },
      expiresAt: '2026-08-10',
      storedLocation: 'fridge',
    });

    expect(requireStockDto(result).amount).toEqual({ value: 2, unit: 'g' });
  });

  it('A-UPD-03: 賞味期限を設定し、ローカル日付を1日ずらさず返す', async () => {
    pantryRepository.seed(createPantry([createStock({ expiresAt: null })]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: '個' },
      expiresAt: '2026-08-20',
      storedLocation: 'fridge',
    });

    expect(requireStockDto(result).expiresAt).toBe('2026-08-20');
  });

  it('A-UPD-04: 賞味期限を null にクリアする', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: '個' },
      expiresAt: null,
      storedLocation: 'fridge',
    });

    expect(requireStockDto(result).expiresAt).toBeNull();
  });

  it('A-UPD-05: 保存場所の設定とクリアを反映する', async () => {
    pantryRepository.seed(createPantry([createStock({ storedLocation: null })]));
    const setResult = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: '個' },
      expiresAt: '2026-08-10',
      storedLocation: 'pantry',
    });
    expect(requireStockDto(setResult).storedLocation).toBe('pantry');

    const clearedResult = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: '個' },
      expiresAt: '2026-08-10',
      storedLocation: null,
    });
    expect(requireStockDto(clearedResult).storedLocation).toBeNull();
  });

  it('A-UPD-06: 3 項目を同時に更新する', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 1.25, unit: 'g' },
      expiresAt: '2026-08-20',
      storedLocation: 'freezer',
    });

    expect(requireStockDto(result)).toMatchObject({
      amount: { value: 1.25, unit: 'g' },
      expiresAt: '2026-08-20',
      storedLocation: 'freezer',
    });
  });

  it('A-UPD-07: 存在しない stockId で StockNotFoundError を投げて保存しない', async () => {
    await expect(
      useCase.execute({
        stockId: 'missing-stock',
        amount: { value: 1, unit: '個' },
        expiresAt: null,
        storedLocation: null,
      }),
    ).rejects.toEqual(new StockNotFoundError('missing-stock'));
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('A-UPD-08: 数量 0 で InvalidStockOperationError を投げて保存しない', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    await expect(
      useCase.execute({
        stockId: STOCK_ID,
        amount: { value: 0, unit: '個' },
        expiresAt: null,
        storedLocation: null,
      }),
    ).rejects.toEqual(new InvalidStockOperationError('Stock amount must be positive'));
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('A-UPD-09: 賞味期限をローカル 0 時の Date に変換する', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 2, unit: '個' },
      expiresAt: '2026-08-20',
      storedLocation: 'fridge',
    });

    const saved = requireStock(await pantryRepository.find());
    expect(saved.expiresAt).toEqual(new Date('2026-08-20T00:00:00'));
  });

  it('A-UPD-10: 編集対象外フィールドを DTO で維持する', async () => {
    pantryRepository.seed(createPantry([createStock()]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 1.25, unit: 'g' },
      expiresAt: null,
      storedLocation: 'freezer',
    });

    expect(requireStockDto(result)).toMatchObject({
      id: STOCK_ID,
      productId: 'product-1',
      displayName: '玉ねぎ',
      purchasedAt: PURCHASED_AT.toISOString(),
    });
  });

  it('A-UPD-11: 対象外の Stock に影響しない', async () => {
    const other = createStock({
      id: StockId.fromString('stock-2'),
      displayName: '人参',
      amount: Quantity.of(3, '本'),
      storedLocation: 'pantry',
    });
    pantryRepository.seed(createPantry([createStock(), other]));

    const result = await useCase.execute({
      stockId: STOCK_ID,
      amount: { value: 1, unit: 'g' },
      expiresAt: null,
      storedLocation: 'freezer',
    });

    expect(requireStockDto(result, 'stock-2')).toMatchObject({
      displayName: '人参',
      amount: { value: 3, unit: '本' },
      storedLocation: 'pantry',
    });
  });

  it('A-UPD-12: 同一入力の 2 回実行は完全べき等に成功する', async () => {
    pantryRepository.seed(createPantry([createStock()]));
    const input: UpdateStockDetailsInputDto = {
      stockId: STOCK_ID,
      amount: { value: 1.25, unit: 'g' },
      expiresAt: '2026-08-20',
      storedLocation: 'freezer',
    };

    const first = requireStockDto(await useCase.execute(input));
    const second = requireStockDto(await useCase.execute(input));

    expect(second.amount).toEqual(first.amount);
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.storedLocation).toBe(first.storedLocation);
    expect(pantryRepository.saveCount).toBe(2);
  });

  it('A-UPD-13: 実行後の入力 amount オブジェクト変更が内部状態に影響しない', async () => {
    pantryRepository.seed(createPantry([createStock()]));
    const input: UpdateStockDetailsInputDto = {
      stockId: STOCK_ID,
      amount: { value: 1.25, unit: 'g' },
      expiresAt: null,
      storedLocation: null,
    };
    await useCase.execute(input);

    input.amount.value = 99;

    expect(requireStock(await pantryRepository.find()).amount.value).toBe(1.25);
  });

  it('A-UPD-14: stockId 不存在と数量 0 の複合で 404 の StockNotFoundError を優先する', async () => {
    await expect(
      useCase.execute({
        stockId: 'missing-stock',
        amount: { value: 0, unit: '個' },
        expiresAt: null,
        storedLocation: null,
      }),
    ).rejects.toEqual(new StockNotFoundError('missing-stock'));
    expect(pantryRepository.saveCount).toBe(0);
  });
});
