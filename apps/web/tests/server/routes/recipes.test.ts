import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import {
  CreateRecipeUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  GetRecipesUseCase,
  UpdateRecipeUseCase,
  RecipeNotFoundError,
} from '@cookpit/application';
import type { RecipeDto } from '@cookpit/application';
import type * as ApplicationModule from '@cookpit/application';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    GetRecipesUseCase: vi.fn(),
    CreateRecipeUseCase: vi.fn(),
    GetRecipeUseCase: vi.fn(),
    UpdateRecipeUseCase: vi.fn(),
    DeleteRecipeUseCase: vi.fn(),
  };
});

const RECIPE_ID = '550e8400-e29b-41d4-a716-446655440000';

const baseRecipeDto: RecipeDto = {
  id: RECIPE_ID,
  name: '肉じゃが',
  baseServings: 4,
  servings: null,
  cookingTime: 30,
  tags: ['主菜'],
  notes: '',
  ingredients: [],
  steps: [{ description: '材料を煮る' }],
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
};

const baseRequestBody = {
  name: '肉じゃが',
  baseServings: 4,
  ingredients: [],
  steps: [{ description: '材料を煮る' }],
  tags: ['主菜'],
  cookingTime: 30,
  notes: '',
};

const updateRequestBody = {
  name: '肉じゃが',
  ingredients: [],
  steps: [{ description: '材料を煮る' }],
  tags: ['主菜'],
  cookingTime: 30,
  notes: '',
};

describe('recipesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-P01
  it('T-P01: POST /api/recipes with servings: 4 → 201、response.servings === 4', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: 4 };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequestBody, servings: 4 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.servings).toBe(4);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // T-P02
  it('T-P02: POST /api/recipes without servings → 201、response.servings === null', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: null };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseRequestBody),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.servings).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // T-P03
  it('T-P03: POST /api/recipes with servings: null → 201、response.servings === null', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: null };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequestBody, servings: null }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.servings).toBeNull();
  });

  // T-P04: Zod validation rejects servings: 0
  it('T-P04: POST /api/recipes with servings: 0 → 400、UseCase が呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequestBody, servings: 0 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  // T-P05: Zod validation rejects servings: -1
  it('T-P05: POST /api/recipes with servings: -1 → 400、UseCase が呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequestBody, servings: -1 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  // T-P06: Zod validation rejects servings: 1.5
  it('T-P06: POST /api/recipes with servings: 1.5 → 400、UseCase が呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(CreateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as CreateRecipeUseCase,
    );

    const res = await app.request('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequestBody, servings: 1.5 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  // T-P07
  it('T-P07: PUT /api/recipes/:id with servings: 2 → 200、response.servings === 2', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: 2 };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(UpdateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as UpdateRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updateRequestBody, servings: 2 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servings).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // T-P08
  it('T-P08: PUT /api/recipes/:id with servings: null → 200、response.servings === null', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: null };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(UpdateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as UpdateRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updateRequestBody, servings: null }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servings).toBeNull();
  });

  // T-P09
  it('T-P09: PUT /api/recipes/:id with servings 省略 → 200、response.servings === null', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: null };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(UpdateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as UpdateRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateRequestBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servings).toBeNull();
  });

  // T-P10: Zod validation rejects servings: 0 on PUT
  it('T-P10: PUT /api/recipes/:id with servings: 0 → 400、UseCase が呼ばれない', async () => {
    const execute = vi.fn();
    vi.mocked(UpdateRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as UpdateRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updateRequestBody, servings: 0 }),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  // T-P11
  it('T-P11: GET /api/recipes → 200、各要素に servings フィールドが存在し値が正しい', async () => {
    const dtos: RecipeDto[] = [
      { ...baseRecipeDto, id: 'id-1', servings: 4 },
      { ...baseRecipeDto, id: 'id-2', servings: null },
    ];
    const execute = vi.fn().mockResolvedValue(dtos);
    vi.mocked(GetRecipesUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetRecipesUseCase,
    );

    const res = await app.request('/api/recipes');

    expect(res.status).toBe(200);
    const body = (await res.json()) as RecipeDto[];
    expect(body).toHaveLength(2);
    const byId = Object.fromEntries(body.map((d) => [d.id, d]));
    expect(byId['id-1']?.servings).toBe(4);
    expect(byId['id-2']?.servings).toBeNull();
  });

  // T-P12
  it('T-P12: GET /api/recipes/:id → 200、servings === 3 が存在する', async () => {
    const dto: RecipeDto = { ...baseRecipeDto, servings: 3 };
    const execute = vi.fn().mockResolvedValue(dto);
    vi.mocked(GetRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servings).toBe(3);
  });

  it('GET /api/recipes/:id が存在しない ID で 404 を返す', async () => {
    const execute = vi.fn().mockRejectedValue(new RecipeNotFoundError(RECIPE_ID));
    vi.mocked(GetRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as GetRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `Recipe not found: ${RECIPE_ID}` });
  });

  it('DELETE /api/recipes/:id は 204 を返す', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DeleteRecipeUseCase).mockImplementation(
      () => ({ execute }) as unknown as DeleteRecipeUseCase,
    );

    const res = await app.request(`/api/recipes/${RECIPE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
  });
});
