import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
  /**
   * 正規化した名前が一致する店舗を返す。同名登録の拒否（ADR-0013）のためだけに使う。
   * 引数は呼び出し側が `normalizeStoreName()` を通した値を渡すこと（実装側では再正規化しない）。
   * 一致が複数ある場合（上限導入前に作られた重複）はどれか 1 件を返す。
   */
  findByNormalizedName(normalizedName: string): Promise<Store | null>;
  save(store: Store): Promise<void>;
  /**
   * 店舗を物理削除する（ADR-0012）。参照が残っていないかの検査は呼び出し側（UseCase）の責務で、
   * このメソッド自体は検査しない。存在しない ID を渡しても例外にはならない（冪等）。
   */
  delete(id: StoreId): Promise<void>;
}
