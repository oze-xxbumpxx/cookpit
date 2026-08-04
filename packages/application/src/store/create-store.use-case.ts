import { normalizeStoreName, Store } from '@cookpit/domain';
import type { StoreRepository } from '@cookpit/domain';
import { DuplicateStoreNameError } from './duplicate-store-name.error';
import { STORE_LIMIT, StoreLimitExceededError } from './store-limit-exceeded.error';
import type { CreateStoreInputDto, StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

/**
 * 店舗を新規登録する。上限件数（3 件）と同名の検査は単一の Store では判定できないコレクション
 * 制約なので、Entity ではなくこの UseCase が担う（ADR-0013）。
 *
 * 検査と保存は別トランザクションのため、同時実行では 4 件目が通り得る（2 人運用では稀。
 * 既知の制約として受け入れる。ADR-0013 §Consequences）。
 */
export class CreateStoreUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  /**
   * @throws StoreLimitExceededError 登録済み店舗が上限に達している場合
   * @throws DuplicateStoreNameError 正規化後の名前が既存店舗と一致する場合
   */
  async execute(input: CreateStoreInputDto): Promise<StoreDto> {
    // 上限を先に判定する。件数超過は「既存を消す」という重い回復手順を要するため、
    // 同名より先に伝えた方が親切（ADR-0013）。
    const existingStores = await this.storeRepository.findAll();
    if (existingStores.length >= STORE_LIMIT) {
      throw new StoreLimitExceededError(STORE_LIMIT, existingStores.length);
    }

    const normalizedName = normalizeStoreName(input.name);
    const duplicate = await this.storeRepository.findByNormalizedName(normalizedName);
    if (duplicate !== null) {
      throw new DuplicateStoreNameError(input.name);
    }

    const store = Store.create({ name: input.name });
    await this.storeRepository.save(store);
    return toStoreDto(store);
  }
}
