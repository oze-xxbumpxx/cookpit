import { StoreId } from '@cookpit/domain';
import type {
  UnitOfWork,
  ProductRepository,
  ShoppingListRepository,
  StoreRepository,
} from '@cookpit/domain';
import { StoreNotFoundError } from './store-not-found.error';

/**
 * 店舗を削除する。参照があっても削除でき、参照ごとカスケードする（ADR-0013。ADR-0012 の
 * 「参照が 1 件でもあれば拒否」を逆転した）。
 *
 * 参照先の扱いは 2 種類で意味が異なる。
 * - 価格記録: **物理削除**する。店舗を剥がした価格記録は「どの店舗が安かったか」という
 *   本体の情報を失うため、残す価値が無い。
 * - 買い物品目の店舗指定: **未割当（null）へ戻す**。品目自体は買う予定として意味が残る。
 *
 * 実行順序は「参照元 → 参照先」で固定する。逆順は `price_records.store_id` の外部キー
 * （restrict）に当たって生の DB エラー（→ 500）になる。FK は順序ミスを検出する安全網として
 * 残してある。書き込み全体は `UnitOfWork.execute` で 1 トランザクションになる（ADR-0019）。
 * 各段の冪等はリトライ時の防衛線として残す。
 *
 * **削除された価格記録は復元できない。**呼び出し側（UI）は削除前に `GetStoreUsageUseCase` で
 * 失われる件数を提示し、ユーザーの確認を取ること。
 */
export class DeleteStoreUseCase {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * @throws StoreNotFoundError 店舗が存在しない場合
   */
  async execute(id: string): Promise<void> {
    return this.unitOfWork.execute(async () => {
      const storeId = StoreId.fromString(id);
      const store = await this.storeRepository.findById(storeId);
      if (store === null) {
        throw new StoreNotFoundError(id);
      }

      await this.productRepository.deletePriceRecordsByStore(storeId);
      await this.unassignFromShoppingLists(storeId);
      await this.storeRepository.delete(storeId);
    });
  }

  private async unassignFromShoppingLists(storeId: StoreId): Promise<void> {
    const shoppingLists = await this.shoppingListRepository.findAllByStore(storeId);

    // 保存はリスト単位で逐次実行し、保存順序を決定的に保つ（並列書き込みにしない）。
    for (const shoppingList of shoppingLists) {
      if (shoppingList.unassignStore(storeId)) {
        await this.shoppingListRepository.save(shoppingList);
      }
    }
  }
}
