import { InvalidOperationError } from '../shared/errors';

/**
 * 既存店舗と同名の店舗を作成・リネームしようとしたときのエラー（ADR-0013・ADR-0015）。
 * `InvalidOperationError` を継承しているため HTTP では 422 になる。
 *
 * 同名判定は `normalizeStoreName()`（前後空白除去 + NFKC）後の完全一致。`attemptedName` には
 * 判定に使った正規化後の名前ではなく、ユーザーが入力した原文を保持する。
 *
 * フィールド名を `name` にしないのは、基底の `Error.name` を潰さないため
 * （`InvalidOperationError` が `new.target.name` を代入している）。
 */
export class DuplicateStoreNameError extends InvalidOperationError {
  constructor(readonly attemptedName: string) {
    super(`Store name '${attemptedName}' already exists`);
  }
}
