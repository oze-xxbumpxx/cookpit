import { describe, it, expect, beforeEach } from 'vitest';
import { Store, StoreId } from '@cookpit/domain';
import type { ProductRepository, ShoppingListRepository, StoreRepository } from '@cookpit/domain';
import { CreateStoreUseCase } from './create-store.use-case';
import { DeleteStoreUseCase } from './delete-store.use-case';
import { GetStoresUseCase } from './get-stores.use-case';
import { StoreInUseError } from './store-in-use.error';
import { StoreNotFoundError } from './store-not-found.error';

// UseCase の検証は外部 I/O を持たないインメモリ Repository で行う（DB 不要）。
// 副作用（保存回数）も観測できるようにする。
class InMemoryStoreRepository implements StoreRepository {
  private readonly map = new Map<string, Store>();
  public saveCount = 0;
  public deleteCount = 0;

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

  async delete(id: StoreId): Promise<void> {
    this.deleteCount += 1;
    this.map.delete(id.value);
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

describe('CreateStoreUseCase + GetStoresUseCase', () => {
  it('作成した Store が GetStoresUseCase で取得できる（N-02）', async () => {
    const createUseCase = new CreateStoreUseCase(repository);
    const getUseCase = new GetStoresUseCase(repository);

    const created = await createUseCase.execute({ name: 'マルエツ' });
    const dtos = await getUseCase.execute();

    expect(dtos).toHaveLength(1);
    expect(dtos[0]?.id).toBe(created.id);
    expect(dtos[0]?.name).toBe('マルエツ');
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

// DeleteStoreUseCase は「参照件数」しか使わないため、件数だけを返すスタブで足りる。
// 呼ばれてはならないメソッドは throw させ、想定外の呼び出しをテストで検出する。
function notCalled(name: string): never {
  throw new Error(`Unexpected call: ${name}`);
}

class CountingProductRepository implements ProductRepository {
  constructor(private readonly countByStore: number) {}

  async findById(): Promise<never> {
    return notCalled('ProductRepository.findById');
  }
  async findAll(): Promise<never> {
    return notCalled('ProductRepository.findAll');
  }
  async save(): Promise<never> {
    return notCalled('ProductRepository.save');
  }
  async delete(): Promise<never> {
    return notCalled('ProductRepository.delete');
  }
  async countPriceRecordsByStore(): Promise<number> {
    return this.countByStore;
  }
}

class CountingShoppingListRepository implements ShoppingListRepository {
  constructor(private readonly countByStore: number) {}

  async findById(): Promise<never> {
    return notCalled('ShoppingListRepository.findById');
  }
  async findByMealPlanId(): Promise<never> {
    return notCalled('ShoppingListRepository.findByMealPlanId');
  }
  async save(): Promise<never> {
    return notCalled('ShoppingListRepository.save');
  }
  async countItemsByStore(): Promise<number> {
    return this.countByStore;
  }
}

function deleteStoreUseCase(
  priceRecordCount: number,
  shoppingItemCount: number,
): DeleteStoreUseCase {
  return new DeleteStoreUseCase(
    repository,
    new CountingProductRepository(priceRecordCount),
    new CountingShoppingListRepository(shoppingItemCount),
  );
}

describe('DeleteStoreUseCase', () => {
  it('DSU-01: どこからも参照されていない店舗を削除する', async () => {
    repository.seed(seededStore('id-1', '西友'));

    await deleteStoreUseCase(0, 0).execute('id-1');

    expect(repository.deleteCount).toBe(1);
    expect(repository.size).toBe(0);
  });

  it('DSU-02: 店舗が存在しなければ StoreNotFoundError を投げ、削除しない', async () => {
    await expect(deleteStoreUseCase(0, 0).execute('missing')).rejects.toBeInstanceOf(
      StoreNotFoundError,
    );
    expect(repository.deleteCount).toBe(0);
  });

  it('DSU-03: 価格記録から参照されていれば StoreInUseError を投げ、削除しない', async () => {
    repository.seed(seededStore('id-1', '西友'));

    await expect(deleteStoreUseCase(3, 0).execute('id-1')).rejects.toBeInstanceOf(StoreInUseError);
    expect(repository.deleteCount).toBe(0);
    expect(repository.size).toBe(1);
  });

  it('DSU-04: 買い物リストの品目から参照されていれば StoreInUseError を投げ、削除しない', async () => {
    repository.seed(seededStore('id-1', '西友'));

    await expect(deleteStoreUseCase(0, 1).execute('id-1')).rejects.toBeInstanceOf(StoreInUseError);
    expect(repository.deleteCount).toBe(0);
  });

  it('DSU-05: StoreInUseError は内訳の件数を保持する', async () => {
    repository.seed(seededStore('id-1', '西友'));

    await expect(deleteStoreUseCase(3, 1).execute('id-1')).rejects.toMatchObject({
      priceRecordCount: 3,
      shoppingItemCount: 1,
    });
  });

  it('DSU-06: 存在確認は参照件数の確認より先に行われる（存在しない店舗では件数を数えない）', async () => {
    // 参照ありの件数を返すスタブでも、存在しない ID なら StoreNotFoundError が先に出る。
    await expect(deleteStoreUseCase(5, 5).execute('missing')).rejects.toBeInstanceOf(
      StoreNotFoundError,
    );
  });
});
