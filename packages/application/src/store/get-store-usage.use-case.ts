import { StoreId } from '@cookpit/domain';
import type { ProductRepository, ShoppingListRepository, StoreRepository } from '@cookpit/domain';
import { StoreNotFoundError } from './store-not-found.error';
import type { StoreUsageDto } from './store.dto';

/**
 * 店舗を削除したときに影響を受けるデータの件数を返す（ADR-0013）。削除確認ダイアログに
 * 「価格記録 N 件が消えます」を出すためだけに使い、削除の可否判定には使わない。
 *
 * 件数の取得と実際の削除は別の要求なので、この件数は参考値である（その間に他方の端末が
 * 価格を記録すれば実際に消える件数は増える）。2 人運用では実害が無いため許容する。
 */
export class GetStoreUsageUseCase {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
  ) {}

  /**
   * @throws StoreNotFoundError 店舗が存在しない場合
   */
  async execute(id: string): Promise<StoreUsageDto> {
    const storeId = StoreId.fromString(id);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(id);
    }

    const [priceRecordCount, shoppingItemCount] = await Promise.all([
      this.productRepository.countPriceRecordsByStore(storeId),
      this.shoppingListRepository.countItemsByStore(storeId),
    ]);

    return { priceRecordCount, shoppingItemCount };
  }
}
