import { STORE_LIMIT as APPLICATION_STORE_LIMIT } from '@cookpit/application';
import { normalizeStoreName as domainNormalizeStoreName } from '@cookpit/domain';
import { describe, expect, it } from 'vitest';
import { isDuplicateStoreName, normalizeStoreName, STORE_LIMIT } from './store-name';

// UI 側の複製がサーバー側の権威実装から乖離しないよう、node 環境で両者を突き合わせる
// （クライアントバンドルでは node:crypto を引き込めないため複製している。store-name.ts 参照）。
describe('サーバー側実装との一致', () => {
  it('STORE_LIMIT が Application 層の値と一致する', () => {
    expect(STORE_LIMIT).toBe(APPLICATION_STORE_LIMIT);
  });

  it.each([
    'ライフ',
    '  ライフ  ',
    'ﾗｲﾌ',
    '業務ｽｰﾊﾟｰ',
    '業務スーパー',
    'ＡＢＣ',
    'Life',
    'life',
    '',
    '   ',
    'コモディ飯田',
  ])('normalizeStoreName(%j) が Domain 実装と一致する', (input) => {
    expect(normalizeStoreName(input)).toBe(domainNormalizeStoreName(input));
  });
});

describe('isDuplicateStoreName', () => {
  it('完全一致を重複と判定する', () => {
    expect(isDuplicateStoreName('ライフ', ['ライフ', 'コモディ飯田'])).toBe(true);
  });

  it('前後空白の違いを重複と判定する', () => {
    expect(isDuplicateStoreName('  ライフ ', ['ライフ'])).toBe(true);
  });

  it('半角カナと全角カナの違いを重複と判定する', () => {
    expect(isDuplicateStoreName('業務ｽｰﾊﾟｰ', ['業務スーパー'])).toBe(true);
  });

  it('既存側に表記ゆれがあっても重複と判定する', () => {
    expect(isDuplicateStoreName('業務スーパー', [' 業務ｽｰﾊﾟｰ '])).toBe(true);
  });

  it('別名は重複と判定しない', () => {
    expect(isDuplicateStoreName('ライフ', ['コモディ飯田'])).toBe(false);
  });

  it('大文字小文字の違いは重複と判定しない（Domain の方針に合わせる）', () => {
    expect(isDuplicateStoreName('Life', ['life'])).toBe(false);
  });

  it('空入力は重複と判定しない（未入力時に警告を出さない）', () => {
    expect(isDuplicateStoreName('   ', ['ライフ'])).toBe(false);
  });

  it('既存が空配列なら重複と判定しない', () => {
    expect(isDuplicateStoreName('ライフ', [])).toBe(false);
  });
});
