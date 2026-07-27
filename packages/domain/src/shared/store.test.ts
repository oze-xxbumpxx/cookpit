import { describe, expect, it } from 'vitest';
import { normalizeStoreName, Store, StoreId } from './store';

describe('StoreId', () => {
  it('generate は UUID を生成する (S1)', () => {
    const id = StoreId.generate();
    expect(id.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generate は毎回異なる値を生成する (S-GAP-1)', () => {
    const a = StoreId.generate();
    const b = StoreId.generate();
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する (S2)', () => {
    const id = StoreId.fromString('store-1');
    expect(id.value).toBe('store-1');
    expect(id.equals(StoreId.fromString('store-1'))).toBe(true);
  });

  it('equals — 異なる値どうしは false を返す (S-GAP-2)', () => {
    expect(StoreId.fromString('store-1').equals(StoreId.fromString('store-2'))).toBe(false);
  });
});

describe('Store', () => {
  it('create で店舗を生成する (S3)', () => {
    const store = Store.create({ name: 'テスト店' });
    expect(store.name).toBe('テスト店');
    expect(store.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.createdAt).toBeInstanceOf(Date);
  });

  it('create の createdAt は現在時刻近傍の Date である (S-GAP-3)', () => {
    const before = Date.now();
    const store = Store.create({ name: '店舗' });
    const after = Date.now();
    expect(store.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(store.createdAt.getTime()).toBeLessThanOrEqual(after);
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

  it('reconstruct 後に渡した createdAt を変更しても影響しない (S-GAP-4)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const store = Store.reconstruct({
      id: StoreId.fromString('store-1'),
      name: '復元店',
      createdAt,
    });
    createdAt.setFullYear(2099);
    expect(store.createdAt.getFullYear()).toBe(2026);
  });
});

describe('normalizeStoreName', () => {
  it.each([
    ['ライフ', 'ライフ', 'NSN-01 正常系'],
    ['  ライフ  ', 'ライフ', 'NSN-02 前後空白除去'],
    ['ﾗｲﾌ', 'ライフ', 'NSN-03 半角カナを全角へ'],
    ['業務ｽｰﾊﾟｰ', '業務スーパー', 'NSN-04 NFKC 混在'],
    ['ＡＢＣ', 'ABC', 'NSN-05 全角英字を半角へ'],
    ['', '', 'NSN-07 空文字'],
  ])('%s を %s に正規化する (%s)', (input, expected) => {
    expect(normalizeStoreName(input)).toBe(expected);
  });

  it('大文字小文字は同一視しない (NSN-06)', () => {
    expect(normalizeStoreName('Life')).not.toBe(normalizeStoreName('life'));
  });

  it('表記ゆれのある同一店舗名が同じ値へ収束する (NSN-04)', () => {
    expect(normalizeStoreName(' 業務ｽｰﾊﾟｰ ')).toBe(normalizeStoreName('業務スーパー'));
  });
});
