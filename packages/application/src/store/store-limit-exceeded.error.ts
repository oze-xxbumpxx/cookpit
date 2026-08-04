import { InvalidOperationError } from '../shared/errors';

/** 店舗マスタに登録できる上限件数（ADR-0013）。実運用の「2 人で 2〜3 店舗を回る」に合わせた実数。 */
export const STORE_LIMIT = 3;

/**
 * 店舗マスタの上限に達している状態で新規作成しようとしたときのエラー（ADR-0013）。
 * `InvalidOperationError` を継承しているため HTTP では 422 になる。
 *
 * `current` は判定時点の登録件数。上限導入前に作られた店舗が残っているため `limit` を超え得る。
 */
export class StoreLimitExceededError extends InvalidOperationError {
  constructor(
    readonly limit: number,
    readonly current: number,
  ) {
    super(`Cannot create Store: limit is ${limit} but ${current} already exist`);
  }
}
