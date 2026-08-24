import type { ProductId } from '../product/product-id';
import type { Quantity } from '../shared/quantity';

/**
 * Generate / Sync 時点で在庫が必要量をすべてまかなった食材のスナップショット。
 * ShoppingItem にはせず、リスト側の coveredIngredients にだけ載せる（チェック対象外）。
 */
export interface CoveredIngredient {
  readonly displayName: string;
  readonly productId: ProductId;
  readonly requiredAmount: Quantity;
  readonly coveredAmount: Quantity;
}
