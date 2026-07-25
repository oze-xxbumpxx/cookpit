import { InvalidOperationError } from '../shared/errors';

/**
 * 在庫操作が対象の在庫に対して実行できないことを表す。理由が多様（単位不一致・数量不正など）
 * なため、メッセージは基底の固定書式に載せず呼び出し側が組み立てる。
 */
export class InvalidStockOperationError extends InvalidOperationError {
  constructor(message: string) {
    super(message);
  }
}
