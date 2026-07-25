import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  ProductNotFoundError,
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
  };
});

const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';

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
    vi.mocked(GetProductsUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetProductsUseCase,
    );

    const res = await app.request('/api/products');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([productDto]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('WH-P-02: POST /api/products はバリデーション通過時に UseCase を呼び 201 を返す', async () => {
    const body = { name: 'トマト', aliases: ['プチトマト'], category: '野菜', defaultUnit: '個' };
    const execute = vi.fn().mockResolvedValue(productDto);
    vi.mocked(CreateProductUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateProductUseCase,
    );

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
    vi.mocked(CreateProductUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateProductUseCase,
    );

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
    vi.mocked(GetProductUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetProductUseCase,
    );

    const res = await app.request(`/api/products/${PRODUCT_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Product not found: ${PRODUCT_ID}` });
  });

  it('WH-P-05: DELETE /api/products/:id は 204 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DeleteProductUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteProductUseCase,
    );

    const res = await app.request(`/api/products/${PRODUCT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(execute).toHaveBeenCalledWith(PRODUCT_ID);
  });
});
