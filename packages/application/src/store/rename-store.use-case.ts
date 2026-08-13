import { normalizeStoreName, StoreId } from '@cookpit/domain';
import type { UnitOfWork, StoreRepository } from '@cookpit/domain';
import { DuplicateStoreNameError } from './duplicate-store-name.error';
import { StoreNotFoundError } from './store-not-found.error';
import type { RenameStoreInputDto, StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

/**
 * 店舗名を変更する。誤字訂正が目的で、重複店舗の統合（マージ）はスコープ外
 * （ADR-0015。マージには価格記録の storeId 付け替えが必要で、リネームだけでは重複は解消しない）。
 */
export class RenameStoreUseCase {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * @throws StoreNotFoundError 店舗が存在しない場合
   * @throws DuplicateStoreNameError 正規化後の名前が「自分以外の」既存店舗と一致する場合
   */
  async execute(input: RenameStoreInputDto): Promise<StoreDto> {
    return this.unitOfWork.execute(async () => {
      const storeId = StoreId.fromString(input.id);
      const store = await this.storeRepository.findById(storeId);
      if (store === null) {
        throw new StoreNotFoundError(input.id);
      }

      const normalizedName = normalizeStoreName(input.name);
      const duplicate = await this.storeRepository.findByNormalizedName(normalizedName);
      // 自分自身がヒットした場合は衝突として扱わない（同じ名前で保存し直す・
      // 大文字小文字だけ変える等の正当なリネームを通す）。
      if (duplicate !== null && !duplicate.id.equals(storeId)) {
        throw new DuplicateStoreNameError(input.name);
      }

      store.rename(input.name);
      await this.storeRepository.save(store);
      return toStoreDto(store);
    });
  }
}
