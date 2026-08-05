import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CreateProductUseCase,
  DeletePriceRecordUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  PriceRecordNotFoundError,
  ProductNotFoundError,
  StoreNotFoundError,
  UpdatePriceRecordUseCase,
} from '@cookpit/application';
import type { ProductDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    GetProductsUseCase: vi.fn(),
    CreateProductUseCase: vi.fn(),
    GetProductUseCase: vi.fn(),
    DeleteProductUseCase: vi.fn(),
    DeletePriceRecordUseCase: vi.fn(),
    UpdatePriceRecordUseCase: vi.fn(),
  };
});

const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';
const PRICE_RECORD_ID = '8f2c1d44-9a3b-4e5f-8a7c-1b2d3e4f5a6b';

const productDto: ProductDto = {
  id: PRODUCT_ID,
  name: 'トマト',
  aliases: [],
  category: '野菜',
  defaultUnit: '個',
  priceHistory: [],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('productsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WH-P-01: GET /api/products は UseCase の返却値を 200 で返す', async () => {
    const execute = vi.fn().mockResolvedValue([productDto]);
    vi.mocked(GetProductsUseCase).mockImplementation(function () {
      return { execute } as unknown as GetProductsUseCase;
    });

    const res = await app.request('/api/products');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([productDto]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('WH-P-02: POST /api/products はバリデーション通過時に UseCase を呼び 201 を返す', async () => {
    const body = { name: 'トマト', aliases: ['プチトマト'], category: '野菜', defaultUnit: '個' };
    const execute = vi.fn().mockResolvedValue(productDto);
    vi.mocked(CreateProductUseCase).mockImplementation(function () {
      return { execute } as unknown as CreateProductUseCase;
    });

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(productDto);
    expect(execute).toHaveBeenCalledWith(body);
  });

  it('WH-P-03: POST /api/products は不正ボディで 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(CreateProductUseCase).mockImplementation(function () {
      return { execute } as unknown as CreateProductUseCase;
    });

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', aliases: [], category: '不明', defaultUnit: '個' }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-P-04: GET /api/products/:id は ProductNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new ProductNotFoundError(PRODUCT_ID));
    vi.mocked(GetProductUseCase).mockImplementation(function () {
      return { execute } as unknown as GetProductUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Product not found: ${PRODUCT_ID}` });
  });

  it('WH-P-05: DELETE /api/products/:id は 204 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DeleteProductUseCase).mockImplementation(function () {
      return { execute } as unknown as DeleteProductUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(execute).toHaveBeenCalledWith(PRODUCT_ID);
  });
  it('WH-P-06: DELETE /api/products/:id/price-records/:priceRecordId は 204 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DeletePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as DeletePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(execute).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      priceRecordId: PRICE_RECORD_ID,
    });
  });

  it('WH-P-07: 価格記録の削除は PriceRecordNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new PriceRecordNotFoundError(PRICE_RECORD_ID));
    vi.mocked(DeletePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as DeletePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `PriceRecord not found: ${PRICE_RECORD_ID}` });
  });

  it('WH-P-08: 価格記録の削除は priceRecordId が UUID でなければ 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(DeletePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as DeletePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/not-a-uuid`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  const validUpdateBody = {
    storeId: '11111111-1111-4111-8111-111111111111',
    priceAmount: 148,
    packageSizeValue: 1,
    packageSizeUnit: '個',
  };

  it('WH-P-09: PUT /price-records/:priceRecordId は 200 で UseCase の返却値を返す', async () => {
    const execute = vi.fn().mockResolvedValue(productDto);
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdateBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(productDto);
    expect(execute).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      priceRecordId: PRICE_RECORD_ID,
      ...validUpdateBody,
    });
  });

  it('WH-P-10: ProductNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new ProductNotFoundError(PRODUCT_ID));
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdateBody),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Product not found: ${PRODUCT_ID}` });
  });

  it('WH-P-11: PriceRecordNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new PriceRecordNotFoundError(PRICE_RECORD_ID));
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdateBody),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `PriceRecord not found: ${PRICE_RECORD_ID}` });
  });

  it('WH-P-12: StoreNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new StoreNotFoundError(validUpdateBody.storeId));
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdateBody),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Store not found: ${validUpdateBody.storeId}` });
  });

  it('WH-P-13: priceAmount が 0 なら 400 を返し、execute は呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validUpdateBody, priceAmount: 0 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-P-14: priceRecordId が UUID でなければ 400 を返し、execute は呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/not-a-uuid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdateBody),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('WH-P-15: 同一ボディで 2 回連続 PUT しても両方 200（冪等性の疎通確認）', async () => {
    const execute = vi.fn().mockResolvedValue(productDto);
    vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
      return { execute } as unknown as UpdatePriceRecordUseCase;
    });

    for (let i = 0; i < 2; i += 1) {
      const res = await app.request(
        `/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validUpdateBody),
        },
      );
      expect(res.status).toBe(200);
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, {
      productId: PRODUCT_ID,
      priceRecordId: PRICE_RECORD_ID,
      ...validUpdateBody,
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      productId: PRODUCT_ID,
      priceRecordId: PRICE_RECORD_ID,
      ...validUpdateBody,
    });
  });
});
