import { InvalidOperationError } from '../shared/errors';

/**
 * 購読件数が上限に達した状態で新規 endpoint を購読しようとしたことを表す（P-15。
 * 無認証 subscribe の悪用防止）。既存 endpoint の再登録（upsert 経路）では投げない。
 */
export class TooManySubscriptionsError extends InvalidOperationError {
  constructor(limit: number) {
    super(`Too many push subscriptions (max ${limit})`);
  }
}
