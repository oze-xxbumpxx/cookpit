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
import { GetExpiringStocksUseCase } from '../../src/pantry/get-expiring-stocks.use-case';

class InMemoryPantryRepository implements PantryRepository {
  private pantry = Pantry.create();

  async find(): Promise<Pantry> {
    return this.pantry;
  }

  async save(pantry: Pantry): Promise<void> {
    this.pantry = pantry;
  }

  seed(pantry: Pantry): void {
    this.pantry = pantry;
  }
}

interface SeededStockOptions {
  id: string;
  expiresAt: Date | null;
  value?: number;
}

function seededStock(options: SeededStockOptions): Stock {
  return Stock.reconstruct({
    id: StockId.fromString(options.id),
    productId: ProductId.fromString('product-1'),
    displayName: `在庫-${options.id}`,
    amount: Quantity.of(options.value ?? 1, '個'),
    purchasedAt: new Date('2026-07-11T09:00:00.000Z'),
    expiresAt: options.expiresAt,
    storedLocation: null,
    sourceShoppingItemId: ShoppingItemId.fromString(`item-${options.id}`),
  });
}

function seededPantry(stocks: Stock[]): Pantry {
  return Pantry.reconstruct({ id: PantryId.singleton(), stocks });
}

let pantryRepository: InMemoryPantryRepository;

beforeEach(() => {
  pantryRepository = new InMemoryPantryRepository();
});

describe('GetExpiringStocksUseCase', () => {
  const asOf = new Date('2026-07-21T09:00:00');

  it('GES-01: 閾値以内の在庫を賞味期限の昇順で返す（閾値ちょうど含む・期限切れ含む・null 除外）', async () => {
    pantryRepository.seed(
      seededPantry([
        seededStock({ id: 'boundary', expiresAt: new Date(2026, 6, 24) }),
        seededStock({ id: 'overdue', expiresAt: new Date(2026, 6, 19) }),
        seededStock({ id: 'no-expiry', expiresAt: null }),
        seededStock({ id: 'far', expiresAt: new Date(2026, 6, 25) }),
      ]),
    );

    const result = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['overdue', 'boundary']);
  });

  it('GES-02: withinDays を省略すると既定値（3 日）を使う', async () => {
    pantryRepository.seed(
      seededPantry([
        seededStock({ id: 'within', expiresAt: new Date(2026, 6, 24) }),
        seededStock({ id: 'outside', expiresAt: new Date(2026, 6, 25) }),
      ]),
    );

    const withDefault = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf);
    const withExplicit = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf, 3);

    expect(withDefault).toEqual(withExplicit);
    expect(withDefault.map((stock) => stock.id)).toEqual(['within']);
  });

  it('GES-03: 数量 0 の在庫は除外しない（SendExpiryAlertsUseCase 側の除外との非対称の固定）', async () => {
    pantryRepository.seed(
      seededPantry([
        seededStock({ id: 'zero-amount', expiresAt: new Date(2026, 6, 22), value: 0 }),
      ]),
    );

    const result = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf, 3);

    expect(result.map((stock) => stock.id)).toEqual(['zero-amount']);
    expect(result[0]?.amount.value).toBe(0);
  });

  it('GES-04: 在庫 0 件で空配列を返す', async () => {
    const result = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf, 3);

    expect(result).toEqual([]);
  });

  it('GES-05: expiresAt が null の在庫は除外する', async () => {
    pantryRepository.seed(seededPantry([seededStock({ id: 'no-expiry', expiresAt: null })]));

    const result = await new GetExpiringStocksUseCase(pantryRepository).execute(asOf, 3);

    expect(result).toEqual([]);
  });
});
