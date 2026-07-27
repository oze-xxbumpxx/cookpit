import { StoreId } from '@cookpit/domain';
import type { ProductRepository, ShoppingListRepository, StoreRepository } from '@cookpit/domain';
import { StoreNotFoundError } from './store-not-found.error';
import { StoreInUseError } from './store-in-use.error';

/**
 * 店舗を削除する。価格記録・買い物リストの品目から参照されている店舗は削除できない（ADR-0012）。
 *
 * 参照件数の確認と削除は別トランザクションのため、その間に価格が記録されると
 * `price_records` の外部キー制約（restrict）が最後の砦として働く（既知の制約）。
 */
export class DeleteStoreUseCase {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
  ) {}

  /**
   * @throws StoreNotFoundError 店舗が存在しない場合
   * @throws StoreInUseError 価格記録または買い物品目から参照されている場合
   */
  async execute(id: string): Promise<void> {
    const storeId = StoreId.fromString(id);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(id);
    }

    const [priceRecordCount, shoppingItemCount] = await Promise.all([
      this.productRepository.countPriceRecordsByStore(storeId),
      this.shoppingListRepository.countItemsByStore(storeId),
    ]);

    if (priceRecordCount > 0 || shoppingItemCount > 0) {
      throw new StoreInUseError(id, priceRecordCount, shoppingItemCount);
    }

    await this.storeRepository.delete(storeId);
  }
}
