import { describe, it, expect } from 'vitest';
import { Store, StoreId } from '@cookpit/domain';
import { toStoreDto } from './store.mapper';

describe('toStoreDto', () => {
  function buildStore(): Store {
    return Store.reconstruct({
      id: StoreId.fromString('store-1'),
      name: '西友',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  }

  it('Store の全フィールドを StoreDto に変換する（N-05）', () => {
    const dto = toStoreDto(buildStore());

    expect(dto.id).toBe('store-1');
    expect(dto.name).toBe('西友');
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('createdAt が ISO 8601 文字列（Z サフィックス）に変換される', () => {
    const dto = toStoreDto(buildStore());

    expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('id が store.id.value と一致する', () => {
    const store = Store.reconstruct({
      id: StoreId.fromString('abc-123'),
      name: 'テスト店舗',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const dto = toStoreDto(store);

    expect(dto.id).toBe('abc-123');
  });

  it('name が store.name と一致する', () => {
    const store = Store.reconstruct({
      id: StoreId.fromString('store-2'),
      name: 'マルエツ',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const dto = toStoreDto(store);

    expect(dto.name).toBe('マルエツ');
  });
});
