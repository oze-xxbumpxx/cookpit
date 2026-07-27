import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CreateStoreUseCase,
  DeleteStoreUseCase,
  GetStoresUseCase,
  StoreInUseError,
  StoreNotFoundError,
} from '@cookpit/application';
import type { StoreDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    GetStoresUseCase: vi.fn(),
    CreateStoreUseCase: vi.fn(),
    DeleteStoreUseCase: vi.fn(),
  };
});

const STORE_ID = 'a1b2c3d4-1111-4222-8333-444455556666';

const storeDto: StoreDto = {
  id: STORE_ID,
  name: '西友',
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('storesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WH-S-01: GET /api/stores は UseCase の返却値を 200 で返す', async () => {
    const execute = vi.fn().mockResolvedValue([storeDto]);
    vi.mocked(GetStoresUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetStoresUseCase,
    );

    const res = await app.request('/api/stores');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([storeDto]);
  });

  it('WH-S-02: POST /api/stores はバリデーション通過時に 201 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(storeDto);
    vi.mocked(CreateStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateStoreUseCase,
    );

    const res = await app.request('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '西友' }),
    });

    expect(res.status).toBe(201);
    expect(execute).toHaveBeenCalledWith({ name: '西友' });
  });

  it('WH-S-03: DELETE /api/stores/:id は 204 を返し、ボディは空', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DeleteStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteStoreUseCase,
    );

    const res = await app.request(`/api/stores/${STORE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(execute).toHaveBeenCalledWith(STORE_ID);
  });

  it('WH-S-04: DELETE /api/stores/:id は StoreNotFoundError 時に 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new StoreNotFoundError(STORE_ID));
    vi.mocked(DeleteStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteStoreUseCase,
    );

    const res = await app.request(`/api/stores/${STORE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Store not found: ${STORE_ID}` });
  });

  it('WH-S-05: DELETE /api/stores/:id は StoreInUseError 時に 422 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new StoreInUseError(STORE_ID, 3, 1));
    vi.mocked(DeleteStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteStoreUseCase,
    );

    const res = await app.request(`/api/stores/${STORE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('3 price record(s)');
    expect(body.error).toContain('1 shopping item(s)');
  });

  it('WH-S-06: DELETE /api/stores/:id は id が UUID でなければ 400 を返す', async () => {
    const execute = vi.fn();
    vi.mocked(DeleteStoreUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteStoreUseCase,
    );

    const res = await app.request('/api/stores/not-a-uuid', { method: 'DELETE' });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
