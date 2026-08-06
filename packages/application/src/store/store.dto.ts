export interface StoreDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateStoreInputDto {
  name: string;
}

export interface RenameStoreInputDto {
  id: string;
  name: string;
}

/**
 * 店舗を削除したときに影響を受けるデータの件数（ADR-0013）。
 *
 * `priceRecordCount` は削除される価格記録の件数（全商品の合計）。
 * `shoppingItemCount` は店舗指定が未割当へ戻る買い物品目の件数（全リストの合計。
 * 同じ品目が購入予定店舗と実購入店舗の両方で参照していても 1 件と数える）。
 */
export interface StoreUsageDto {
  priceRecordCount: number;
  shoppingItemCount: number;
}
