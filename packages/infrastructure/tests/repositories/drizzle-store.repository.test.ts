import { beforeEach, describe, expect, it } from 'vitest';
import { Store, StoreId } from '@cookpit/domain';
import type { DrizzleClient } from '../../src/db/client';
import { createTestDb } from '../testing/create-test-db';
import { DrizzleStoreRepository } from '../../src/repositories/drizzle-store.repository';

describe('DrizzleStoreRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzleStoreRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzleStoreRepository(db);
  });

  it('IR-S-01: save() + findById() ラウンドトリップで全フィールドが一致する', async () => {
    const store = Store.reconstruct({
      id: StoreId.generate(),
      name: 'スーパーA',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    await repository.save(store);
    const found = await repository.findById(store.id);

    expect(found).not.toBeNull();
    expect(found?.id.equals(store.id)).toBe(true);
    expect(found?.name).toBe('スーパーA');
    expect(found?.createdAt.getTime()).toBe(store.createdAt.getTime());
  });

  it('IR-S-02: findAll() で createdAt 順に返る（INFRA-R-11: 全フィールド往復）', async () => {
    const older = Store.reconstruct({
      id: StoreId.generate(),
      name: '八百屋B',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const newer = Store.reconstruct({
      id: StoreId.generate(),
      name: 'スーパーA',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    });

    await repository.save(newer);
    await repository.save(older);
    const all = await repository.findAll();

    expect(all).toHaveLength(2);
    expect(all[0]?.name).toBe('八百屋B');
    expect(all[1]?.name).toBe('スーパーA');
    expect(all[0]?.id.equals(older.id)).toBe(true);
    expect(all[0]?.createdAt.getTime()).toBe(older.createdAt.getTime());
  });

  it('IR-S-03: findById() で存在しない ID は null を返す', async () => {
    const found = await repository.findById(StoreId.generate());

    expect(found).toBeNull();
  });

  it('IR-S-04: delete() で行が消え、他の店舗は残る', async () => {
    const target = Store.reconstruct({
      id: StoreId.generate(),
      name: '消す店',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const kept = Store.reconstruct({
      id: StoreId.generate(),
      name: '残す店',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    });
    await repository.save(target);
    await repository.save(kept);

    await repository.delete(target.id);

    expect(await repository.findById(target.id)).toBeNull();
    expect(await repository.findAll()).toHaveLength(1);
    expect((await repository.findById(kept.id))?.name).toBe('残す店');
  });

  it('IR-S-05: delete() は存在しない ID でも例外にならない（冪等）', async () => {
    await expect(repository.delete(StoreId.generate())).resolves.toBeUndefined();
  });

  it('IR-01: findByNormalizedName() は完全一致で 1 件返す', async () => {
    const store = Store.create({ name: 'ライフ' });
    await repository.save(store);

    const found = await repository.findByNormalizedName('ライフ');

    expect(found?.id.equals(store.id)).toBe(true);
  });

  it('IR-02: findByNormalizedName() は表記ゆれ（半角カナ）でも一致する', async () => {
    await repository.save(Store.create({ name: '業務ｽｰﾊﾟｰ' }));

    const found = await repository.findByNormalizedName('業務スーパー');

    expect(found?.name).toBe('業務ｽｰﾊﾟｰ');
  });

  it('IR-02: findByNormalizedName() は前後空白付きで保存された店舗にも一致する', async () => {
    await repository.save(Store.create({ name: ' ライフ ' }));

    expect(await repository.findByNormalizedName('ライフ')).not.toBeNull();
  });

  it('IR-03: findByNormalizedName() は一致が無ければ null を返す', async () => {
    await repository.save(Store.create({ name: 'ライフ' }));

    expect(await repository.findByNormalizedName('コモディ飯田')).toBeNull();
  });
});
