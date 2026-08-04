import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  AddStockUseCase,
  ConsumeStockUseCase,
  DiscardStockUseCase,
  GetPantryUseCase,
  InvalidStockOperationError,
  StockNotFoundError,
} from '@cookpit/application';
import type { PantryDto, StockDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    AddStockUseCase: vi.fn(),
    ConsumeStockUseCase: vi.fn(),
    DiscardStockUseCase: vi.fn(),
    GetPantryUseCase: vi.fn(),
  };
});

const STOCK_ID = '1cc1a576-1d61-49b7-a9e8-cc6a719d0215';
const SECOND_STOCK_ID = '21e45d85-02f8-485c-ac08-49f16991de39';
const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';

const stockDto: StockDto = {
  id: STOCK_ID,
  productId: PRODUCT_ID,
  displayName: '玉ねぎ',
  amount: { value: 2, unit: '個' },
  purchasedAt: '2026-07-19T01:00:00.000Z',
  expiresAt: null,
  storedLocation: 'fridge',
};

const pantryDto: PantryDto = {
  stocks: [
    stockDto,
    {
      ...stockDto,
      id: SECOND_STOCK_ID,
      productId: null,
      displayName: '塩',
      amount: { value: 100, unit: 'g' },
      storedLocation: 'pantry',
    },
  ],
};

describe('pantryRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/pantry は空の Pantry でも 200 で空配列を返す', async () => {
    const execute = vi.fn().mockResolvedValue({ stocks: [] });
    vi.mocked(GetPantryUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetPantryUseCase,
    );

    const res = await app.request('/api/pantry');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stocks: [] });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('GET /api/pantry は 200 で複数の Stock をすべて返す', async () => {
    const execute = vi.fn().mockResolvedValue(pantryDto);
    vi.mocked(GetPantryUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetPantryUseCase,
    );

    const res = await app.request('/api/pantry');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pantryDto);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('POST /api/pantry/stocks は 201 で更新後 PantryDto を返す', async () => {
    const body = {
      displayName: '玉ねぎ',
      amount: { value: 3, unit: '個' },
      storedLocation: 'fridge',
      expiresAt: '2026-07-31',
    };
    const execute = vi.fn().mockResolvedValue(pantryDto);
    vi.mocked(AddStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as AddStockUseCase,
    );

    const res = await app.request('/api/pantry/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(pantryDto);
    expect(execute).toHaveBeenCalledWith(body);
  });

  it('POST /api/pantry/stocks は displayName が空の場合 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(AddStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as AddStockUseCase,
    );

    const res = await app.request('/api/pantry/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '',
        amount: { value: 1, unit: '個' },
        storedLocation: null,
        expiresAt: null,
      }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/pantry/stocks は amount.value が 0 の場合 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(AddStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as AddStockUseCase,
    );

    const res = await app.request('/api/pantry/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '玉ねぎ',
        amount: { value: 0, unit: '個' },
        storedLocation: null,
        expiresAt: null,
      }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/pantry/stocks/:stockId/consume は 200 で PantryDto を返す', async () => {
    const body = { amount: { value: 1, unit: '個' } };
    const execute = vi.fn().mockResolvedValue(pantryDto);
    vi.mocked(ConsumeStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as ConsumeStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pantryDto);
    expect(execute).toHaveBeenCalledWith({ stockId: STOCK_ID, ...body });
  });

  it('POST /api/pantry/stocks/:stockId/consume は amount.value が 0 の場合 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(ConsumeStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as ConsumeStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: { value: 0, unit: '個' } }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/pantry/stocks/:stockId/consume は不正な stockId で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(ConsumeStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as ConsumeStockUseCase,
    );

    const res = await app.request('/api/pantry/stocks/not-a-uuid/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: { value: 1, unit: '個' } }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/pantry/stocks/:stockId/consume は StockNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new StockNotFoundError(STOCK_ID));
    vi.mocked(ConsumeStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as ConsumeStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: { value: 1, unit: '個' } }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Stock not found: ${STOCK_ID}` });
  });

  it('POST /api/pantry/stocks/:stockId/consume は InvalidStockOperationError を 422 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new InvalidStockOperationError('Unit mismatch'));
    vi.mocked(ConsumeStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as ConsumeStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: { value: 1, unit: '個' } }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Unit mismatch' });
  });

  it('POST /api/pantry/stocks/:stockId/discard は 200 で PantryDto を返す', async () => {
    const execute = vi.fn().mockResolvedValue(pantryDto);
    vi.mocked(DiscardStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as DiscardStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/discard`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pantryDto);
    expect(execute).toHaveBeenCalledWith({ stockId: STOCK_ID });
  });

  it('POST /api/pantry/stocks/:stockId/discard は不正な stockId で 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(DiscardStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as DiscardStockUseCase,
    );

    const res = await app.request('/api/pantry/stocks/not-a-uuid/discard', {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('POST /api/pantry/stocks/:stockId/discard は StockNotFoundError を 404 に変換する', async () => {
    const execute = vi.fn().mockRejectedValue(new StockNotFoundError(STOCK_ID));
    vi.mocked(DiscardStockUseCase).mockImplementation(
      () => ({ execute }) as unknown as DiscardStockUseCase,
    );

    const res = await app.request(`/api/pantry/stocks/${STOCK_ID}/discard`, {
      method: 'POST',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Stock not found: ${STOCK_ID}` });
  });
});
