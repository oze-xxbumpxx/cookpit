import { InvalidOperationError } from '../shared/errors';

/**
 * 参照が残っている店舗を削除しようとしたときのエラー（ADR-0012）。
 * `InvalidOperationError` を継承しているため HTTP では 422 になる。
 *
 * 内訳の件数は「何が参照を残しているか」を後から追えるようにメッセージへ含める。
 */
export class StoreInUseError extends InvalidOperationError {
  constructor(
    storeId: string,
    readonly priceRecordCount: number,
    readonly shoppingItemCount: number,
  ) {
    super(
      `Cannot delete Store ${storeId}: still referenced by ${priceRecordCount} price record(s) and ${shoppingItemCount} shopping item(s)`,
    );
  }
}
