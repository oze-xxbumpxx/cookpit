import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeStoreName, Store, StoreId } from '@cookpit/domain';
import type {
  ProductRepository,
  ShoppingList,
  ShoppingListRepository,
  StoreRepository,
} from '@cookpit/domain';
import { CreateStoreUseCase } from '../../src/store/create-store.use-case';
import { DeleteStoreUseCase } from '../../src/store/delete-store.use-case';
import { DuplicateStoreNameError } from '../../src/store/duplicate-store-name.error';
import { GetStoreUsageUseCase } from '../../src/store/get-store-usage.use-case';
import { GetStoresUseCase } from '../../src/store/get-stores.use-case';
import { RenameStoreUseCase } from '../../src/store/rename-store.use-case';
import { STORE_LIMIT, StoreLimitExceededError } from '../../src/store/store-limit-exceeded.error';
import { StoreNotFoundError } from '../../src/store/store-not-found.error';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';

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

  async findByNormalizedName(normalizedName: string): Promise<Store | null> {
    for (const store of this.map.values()) {
      if (normalizeStoreName(store.name) === normalizedName) {
        return store;
      }
    }
    return null;
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

/** 上限判定の境界値テスト用に、名前の異なる店舗を指定件数だけ詰める。 */
function seedStores(target: InMemoryStoreRepository, count: number): void {
  for (let index = 0; index < count; index += 1) {
    target.seed(seededStore(`id-${index}`, `店舗${index}`));
  }
}

let repository: InMemoryStoreRepository;

beforeEach(() => {
  repository = new InMemoryStoreRepository();
});

describe('CreateStoreUseCase', () => {
  it('ストアを保存し、入力どおりの DTO を返す（N-01 / CSU-01）', async () => {
    const usecase = new CreateStoreUseCase(repository, passthroughUnitOfWork);

    const dto = await usecase.execute({ name: '西友' });

    expect(repository.saveCount).toBe(1);
    expect(repository.size).toBe(1);
    expect(dto.id).not.toBe('');
    expect(dto.name).toBe('西友');
    expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('空の name はドメインバリデーションで弾かれ、保存されない（E-01 / CSU-09）', async () => {
    const usecase = new CreateStoreUseCase(repository, passthroughUnitOfWork);

    await expect(usecase.execute({ name: '' })).rejects.toThrow('Store name is required');
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(0);
  });

  it('空白のみの name はドメインバリデーションで弾かれ、保存されない（E-02 / CSU-09）', async () => {
    const usecase = new CreateStoreUseCase(repository, passthroughUnitOfWork);

    await expect(usecase.execute({ name: '  ' })).rejects.toThrow('Store name is required');
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(0);
  });

  it('CSU-02: 既存 2 件なら 3 件目を作成できる（上限の境界値）', async () => {
    seedStores(repository, STORE_LIMIT - 1);

    await new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: 'ライフ' });

    expect(repository.size).toBe(STORE_LIMIT);
  });

  it('CSU-03: 既存 3 件なら StoreLimitExceededError を投げ、保存しない（上限の境界値）', async () => {
    seedStores(repository, STORE_LIMIT);

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: 'ライフ' }),
    ).rejects.toBeInstanceOf(StoreLimitExceededError);
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(STORE_LIMIT);
  });

  it('CSU-04: 上限を超える既存 10 件（本番相当）でも拒否し、既存は壊さない', async () => {
    seedStores(repository, 10);

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: 'ライフ' }),
    ).rejects.toMatchObject({ limit: STORE_LIMIT, current: 10 });
    expect(repository.size).toBe(10);
  });

  it('CSU-05: 既存と同名なら DuplicateStoreNameError を投げ、保存しない', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: 'ライフ' }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(1);
  });

  it('CSU-06: 前後空白の違いは同名として拒否する', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: '  ライフ  ' }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
  });

  it('CSU-07: 半角カナと全角カナの違い（NFKC）は同名として拒否する', async () => {
    repository.seed(seededStore('id-1', '業務スーパー'));

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: '業務ｽｰﾊﾟｰ' }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
  });

  it('CSU-07: DuplicateStoreNameError は入力された原文を保持する', async () => {
    repository.seed(seededStore('id-1', '業務スーパー'));

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: '業務ｽｰﾊﾟｰ' }),
    ).rejects.toMatchObject({ attemptedName: '業務ｽｰﾊﾟｰ' });
  });

  it('CSU-08: 上限到達かつ同名なら上限エラーが優先される（判定順序）', async () => {
    seedStores(repository, STORE_LIMIT - 1);
    repository.seed(seededStore('dup', 'ライフ'));

    await expect(
      new CreateStoreUseCase(repository, passthroughUnitOfWork).execute({ name: 'ライフ' }),
    ).rejects.toBeInstanceOf(StoreLimitExceededError);
  });

  it('CSU-01: 異なる名前なら上限内で複数作成できる', async () => {
    const usecase = new CreateStoreUseCase(repository, passthroughUnitOfWork);

    await usecase.execute({ name: 'ライフ' });
    await usecase.execute({ name: 'コモディ飯田' });

    expect(repository.size).toBe(2);
  });
});

describe('CreateStoreUseCase + GetStoresUseCase', () => {
  it('作成した Store が GetStoresUseCase で取得できる（N-02）', async () => {
    const createUseCase = new CreateStoreUseCase(repository, passthroughUnitOfWork);
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

// カスケード削除（ADR-0013）の検証には「呼ばれたか」と「呼ばれた順序」の両方が必要なため、
// スタブは共有の calls 配列へ自分の呼び出しを記録する。順序は FK restrict を踏まないための
// 要件そのものなので、順序まで検証する。
// 呼ばれてはならないメソッドは throw させ、想定外の呼び出しをテストで検出する。
function notCalled(name: string): never {
  throw new Error(`Unexpected call: ${name}`);
}

class CascadeProductRepository implements ProductRepository {
  constructor(
    private readonly calls: string[],
    private readonly countByStore = 0,
  ) {}

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
  async deletePriceRecordsByStore(): Promise<void> {
    this.calls.push('deletePriceRecords');
  }
}

class CascadeShoppingListRepository implements ShoppingListRepository {
  constructor(
    private readonly calls: string[],
    private readonly lists: ShoppingList[] = [],
    private readonly countByStore = 0,
  ) {}

  async findById(): Promise<never> {
    return notCalled('ShoppingListRepository.findById');
  }
  async findByMealPlanId(): Promise<never> {
    return notCalled('ShoppingListRepository.findByMealPlanId');
  }
  async save(): Promise<void> {
    this.calls.push('saveShoppingList');
  }
  async countItemsByStore(): Promise<number> {
    return this.countByStore;
  }
  async findAllByStore(): Promise<ShoppingList[]> {
    this.calls.push('findAllByStore');
    return this.lists;
  }
}

/** `unassignStore` の戻り値だけを制御する最小の ShoppingList スタブ。 */
function stubShoppingList(changed: boolean): ShoppingList {
  return { unassignStore: (): boolean => changed } as unknown as ShoppingList;
}

interface CascadeContext {
  calls: string[];
  usecase: DeleteStoreUseCase;
  storeRepository: InMemoryStoreRepository;
}

/**
 * 店舗削除の呼び出し順序を観測できる UseCase を組み立てる。店舗の delete だけは
 * インメモリ実装の副作用も必要なので、Proxy で記録を挟んで元の実装へ委譲する。
 */
function cascadeContext(lists: ShoppingList[] = []): CascadeContext {
  const calls: string[] = [];
  const storeRepository = new InMemoryStoreRepository();
  const trackedStoreRepository = new Proxy(storeRepository, {
    get(target, property, receiver) {
      if (property === 'delete') {
        return async (id: StoreId): Promise<void> => {
          calls.push('deleteStore');
          await target.delete(id);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return {
    calls,
    storeRepository,
    usecase: new DeleteStoreUseCase(
      trackedStoreRepository,
      new CascadeProductRepository(calls),
      new CascadeShoppingListRepository(calls, lists),
      passthroughUnitOfWork,
    ),
  };
}

describe('DeleteStoreUseCase', () => {
  it('DSU-02: 参照が無い店舗を削除する', async () => {
    const context = cascadeContext();
    context.storeRepository.seed(seededStore('id-1', '西友'));

    await context.usecase.execute('id-1');

    expect(context.storeRepository.size).toBe(0);
  });

  it('DSU-01: 店舗が存在しなければ StoreNotFoundError を投げ、何も消さない', async () => {
    const context = cascadeContext();

    await expect(context.usecase.execute('missing')).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(context.calls).toEqual([]);
  });

  it('DSU-03/04/05: 価格記録の削除・品目の解除・店舗の削除をすべて実行する', async () => {
    const context = cascadeContext([stubShoppingList(true)]);
    context.storeRepository.seed(seededStore('id-1', '西友'));

    await context.usecase.execute('id-1');

    expect(context.calls).toContain('deletePriceRecords');
    expect(context.calls).toContain('saveShoppingList');
    expect(context.calls).toContain('deleteStore');
  });

  it('DSU-06: 価格記録削除 → 品目解除 → 店舗削除 の順で実行する（FK restrict 対策）', async () => {
    const context = cascadeContext([stubShoppingList(true)]);
    context.storeRepository.seed(seededStore('id-1', '西友'));

    await context.usecase.execute('id-1');

    expect(context.calls).toEqual([
      'deletePriceRecords',
      'findAllByStore',
      'saveShoppingList',
      'deleteStore',
    ]);
  });

  it('DSU-07: unassignStore が false のリストは save しない', async () => {
    const context = cascadeContext([stubShoppingList(false)]);
    context.storeRepository.seed(seededStore('id-1', '西友'));

    await context.usecase.execute('id-1');

    expect(context.calls).toEqual(['deletePriceRecords', 'findAllByStore', 'deleteStore']);
  });

  it('DSU-04: 複数リストが参照していれば、変更があった分だけ save する', async () => {
    const context = cascadeContext([
      stubShoppingList(true),
      stubShoppingList(false),
      stubShoppingList(true),
    ]);
    context.storeRepository.seed(seededStore('id-1', '西友'));

    await context.usecase.execute('id-1');

    expect(context.calls.filter((call) => call === 'saveShoppingList')).toHaveLength(2);
  });
});

describe('RenameStoreUseCase', () => {
  it('A-RSU-01: 名前が変わる', async () => {
    repository.seed(seededStore('id-1', '業務スーパ'));

    const dto = await new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
      id: 'id-1',
      name: '業務スーパー',
    });

    expect(dto.name).toBe('業務スーパー');
    expect(repository.saveCount).toBe(1);
  });

  it('A-RSU-02: 同じ文字列のまま保存し直しても成功する（N-08・冪等）', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-1',
        name: 'ライフ',
      }),
    ).resolves.toMatchObject({ name: 'ライフ' });
  });

  it('A-RSU-03: 大文字小文字だけ変える（N-07/B-04）', async () => {
    repository.seed(seededStore('id-1', 'Life'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-1',
        name: 'life',
      }),
    ).resolves.toMatchObject({ name: 'life' });
  });

  it('A-RSU-04: 全角/半角違いを自分自身に適用しても成功する（自己衝突除外）', async () => {
    repository.seed(seededStore('id-1', '業務スーパー'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-1',
        name: '業務ｽｰﾊﾟｰ',
      }),
    ).resolves.toMatchObject({ name: '業務ｽｰﾊﾟｰ' });
  });

  it('A-RSU-05: 全角/半角違いが自分以外の既存店舗と一致すると DuplicateStoreNameError', async () => {
    repository.seed(seededStore('id-1', '業務スーパー'));
    repository.seed(seededStore('id-2', 'コンビニ'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-2',
        name: '業務ｽｰﾊﾟｰ',
      }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
    expect(repository.saveCount).toBe(0);
  });

  it('A-RSU-06: 前後空白のみの違いを自分自身に適用しても成功し、原文をそのまま保存する', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-1',
        name: '  ライフ  ',
      }),
    ).resolves.toMatchObject({ name: '  ライフ  ' });
  });

  it('A-RSU-07: 前後空白のみの違いが自分以外の既存店舗と一致すると DuplicateStoreNameError', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));
    repository.seed(seededStore('id-2', 'コンビニ'));

    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'id-2',
        name: '  ライフ  ',
      }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
    expect(repository.saveCount).toBe(0);
  });

  it('A-RSU-08: 店舗が存在しなければ StoreNotFoundError を投げる', async () => {
    await expect(
      new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
        id: 'missing',
        name: 'ライフ',
      }),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  it('A-RSU-09: 同一 name で 2 回連続 execute しても StoreDto が完全一致する（冪等性）', async () => {
    repository.seed(seededStore('id-1', '西友'));
    const usecase = new RenameStoreUseCase(repository, passthroughUnitOfWork);

    const first = await usecase.execute({ id: 'id-1', name: '西友' });
    const second = await usecase.execute({ id: 'id-1', name: '西友' });

    expect(second).toEqual(first);
  });

  it('A-RSU-10: リネームは店舗件数に影響しない（B-07）', async () => {
    seedStores(repository, STORE_LIMIT);
    const target = (await repository.findAll())[0];
    if (target === undefined) {
      throw new Error('test setup failed: no seeded store found');
    }

    await new RenameStoreUseCase(repository, passthroughUnitOfWork).execute({
      id: target.id.value,
      name: '新名前',
    });

    expect((await repository.findAll()).length).toBe(STORE_LIMIT);
  });
});

describe('GetStoreUsageUseCase', () => {
  function usageUseCase(priceRecordCount: number, shoppingItemCount: number): GetStoreUsageUseCase {
    return new GetStoreUsageUseCase(
      repository,
      new CascadeProductRepository([], priceRecordCount),
      new CascadeShoppingListRepository([], [], shoppingItemCount),
    );
  }

  it('GSU-01: 店舗が存在しなければ StoreNotFoundError を投げる', async () => {
    await expect(usageUseCase(3, 2).execute('missing')).rejects.toBeInstanceOf(StoreNotFoundError);
  });

  it('GSU-02: 価格記録と品目の件数を返す', async () => {
    repository.seed(seededStore('id-1', '西友'));

    expect(await usageUseCase(3, 2).execute('id-1')).toEqual({
      priceRecordCount: 3,
      shoppingItemCount: 2,
    });
  });

  it('GSU-03: 参照が無ければ 0 件を返す', async () => {
    repository.seed(seededStore('id-1', '西友'));

    expect(await usageUseCase(0, 0).execute('id-1')).toEqual({
      priceRecordCount: 0,
      shoppingItemCount: 0,
    });
  });
});
