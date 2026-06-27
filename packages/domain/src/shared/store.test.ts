import { describe, expect, it } from 'vitest';
import { Store, StoreId } from './store';

describe('StoreId', () => {
  it('generate は UUID を生成する (S1)', () => {
    const id = StoreId.generate();
    expect(id.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fromString は値を保持する (S2)', () => {
    const id = StoreId.fromString('store-1');
    expect(id.value).toBe('store-1');
    expect(id.equals(StoreId.fromString('store-1'))).toBe(true);
  });
});

describe('Store', () => {
  it('create で店舗を生成する (S3)', () => {
    const store = Store.create({ name: 'テスト店' });
    expect(store.name).toBe('テスト店');
    expect(store.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.createdAt).toBeInstanceOf(Date);
  });

  it('create は空白の名前を拒否する (S4)', () => {
    expect(() => Store.create({ name: '  ' })).toThrow('Store name is required');
  });

  it('reconstruct は props の値を保持して復元する (S5)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const store = Store.reconstruct({
      id: StoreId.fromString('store-1'),
      name: '復元店',
      createdAt,
    });

    expect(store.id.value).toBe('store-1');
    expect(store.name).toBe('復元店');
    expect(store.createdAt.toISOString()).toBe(createdAt.toISOString());
  });
});
