import { describe, it, expect, beforeEach } from 'vitest';
import { Store, StoreId } from '@cookpit/domain/src/shared/store';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import { CreateStoreUseCase } from './create-store.use-case';
import { GetStoresUseCase } from './get-stores.use-case';

// UseCase の検証は外部 I/O を持たないインメモリ Repository で行う（DB 不要）。
// 副作用（保存回数）も観測できるようにする。
class InMemoryStoreRepository implements StoreRepository {
  private readonly map = new Map<string, Store>();
  public saveCount = 0;

  async findById(id: StoreId): Promise<Store | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Store[]> {
    return [...this.map.values()];
  }

  async save(store: Store): Promise<void> {
    this.saveCount += 1;
    this.map.set(store.id.value, store);
  }

  seed(store: Store): void {
    this.map.set(store.id.value, store);
  }

  get size(): number {
    return this.map.size;
  }
}

function seededStore(id: string, name = '西友'): Store {
  return Store.reconstruct({
    id: StoreId.fromString(id),
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

let repository: InMemoryStoreRepository;

beforeEach(() => {
  repository = new InMemoryStoreRepository();
});

describe('CreateStoreUseCase', () => {
  it('ストアを保存し、入力どおりの DTO を返す（N-01）', async () => {
    const usecase = new CreateStoreUseCase(repository);

    const dto = await usecase.execute({ name: '西友' });

    expect(repository.saveCount).toBe(1);
    expect(repository.size).toBe(1);
    expect(dto.id).not.toBe('');
    expect(dto.name).toBe('西友');
    expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('空の name はドメインバリデーションで弾かれ、保存されない（E-01）', async () => {
    const usecase = new CreateStoreUseCase(repository);

    await expect(usecase.execute({ name: '' })).rejects.toThrow('Store name is required');
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(0);
  });

  it('空白のみの name はドメインバリデーションで弾かれ、保存されない（E-02）', async () => {
    const usecase = new CreateStoreUseCase(repository);

    await expect(usecase.execute({ name: '  ' })).rejects.toThrow('Store name is required');
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(0);
  });
});

describe('GetStoresUseCase', () => {
  it('0件の場合は空配列を返す（N-03）', async () => {
    const dtos = await new GetStoresUseCase(repository).execute();

    expect(dtos).toEqual([]);
  });

  it('複数件の場合は全件を StoreDto[] で返す（N-04）', async () => {
    repository.seed(seededStore('id-1', 'イオン'));
    repository.seed(seededStore('id-2', 'ライフ'));

    const dtos = await new GetStoresUseCase(repository).execute();

    expect(dtos).toHaveLength(2);
    expect(dtos.map((d) => d.name).sort()).toEqual(['イオン', 'ライフ']);
  });

  it('各ストアの DTO フィールドが正しくマッピングされる', async () => {
    repository.seed(seededStore('id-1', '西友'));

    const dtos = await new GetStoresUseCase(repository).execute();

    expect(dtos[0]?.id).toBe('id-1');
    expect(dtos[0]?.name).toBe('西友');
    expect(dtos[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
