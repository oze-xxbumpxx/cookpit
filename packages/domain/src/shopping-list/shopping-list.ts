import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { ProductId } from '../product/product-id';
import type { Money } from '../shared/money';
import type { Quantity } from '../shared/quantity';
import type { StoreId } from '../shared/store';
import { ShoppingItemId } from './shopping-item-id';
import { ShoppingListId } from './shopping-list-id';

export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';
export type ShoppingListStatus = 'active' | 'completed';

export interface CreateShoppingItemInput {
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null;
  amountNote: string | null;
  targetStore: StoreId | null;
  source: ItemSource;
}

export interface ShoppingItemProps {
  id: ShoppingItemId;
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null;
  amountNote: string | null;
  targetStore: StoreId | null;
  status: ItemStatus;
  actualPrice: Money | null;
  actualStore: StoreId | null;
  source: ItemSource;
}

export class ShoppingItem {
  private constructor(
    private readonly shoppingItemId: ShoppingItemId,
    private readonly itemProductId: ProductId | null,
    private readonly itemDisplayName: string,
    private itemRequiredAmount: Quantity | null,
    private itemAmountNote: string | null,
    private itemTargetStore: StoreId | null,
    private itemStatus: ItemStatus,
    private itemActualPrice: Money | null,
    private itemActualStore: StoreId | null,
    private readonly itemSource: ItemSource,
  ) {}

  /**
   * requiredAmount と amountNote はどちらか一方のみ指定する（両方 null・両方非 null は不可）。
   *
   * @throws Error displayName が空白のみ、または requiredAmount / amountNote の排他制約違反
   */
  static create(input: CreateShoppingItemInput): ShoppingItem {
    if (input.displayName.trim() === '') {
      throw new Error('Display name is required');
    }

    const hasAmount = input.requiredAmount !== null;
    const hasAmountNote = input.amountNote !== null && input.amountNote.trim() !== '';
    if (!hasAmount && !hasAmountNote) {
      throw new Error('Either requiredAmount or amountNote is required');
    }
    if (hasAmount === hasAmountNote) {
      throw new Error('requiredAmount and amountNote cannot both be set');
    }

    return new ShoppingItem(
      ShoppingItemId.generate(),
      input.productId,
      input.displayName,
      input.requiredAmount,
      input.amountNote,
      input.targetStore,
      'pending',
      null,
      null,
      input.source,
    );
  }

  static reconstruct(props: ShoppingItemProps): ShoppingItem {
    return new ShoppingItem(
      props.id,
      props.productId,
      props.displayName,
      props.requiredAmount,
      props.amountNote,
      props.targetStore,
      props.status,
      props.actualPrice,
      props.actualStore,
      props.source,
    );
  }

  /** bought の再適用と skipped からの購入確定は、最新の実績で上書きする。 */
  markAsBought(price: Money, store: StoreId): void {
    this.itemStatus = 'bought';
    this.itemActualPrice = price;
    this.itemActualStore = store;
  }

  /**
   * 購入実績を残したまま skipped にすると不整合になるため、pending からのみ許可する。
   *
   * @throws Error status が pending 以外
   */
  markAsSkipped(): void {
    if (this.itemStatus !== 'pending') {
      throw new Error(`Cannot skip a ShoppingItem with status '${this.itemStatus}'`);
    }
    this.itemStatus = 'skipped';
  }

  /** 購入予定店舗の変更は、確定済みの購入実績（actualPrice / actualStore）に影響させない。 */
  reassignStore(newStore: StoreId): void {
    this.itemTargetStore = newStore;
  }

  /**
   * 指定した店舗への参照を外し、targetStore / actualStore を null へ戻す（ADR-0013）。
   * 店舗が削除されたときの後始末専用で、ユーザーによる店舗変更ではない。
   *
   * actualPrice には触れない。status も変えない（`check()` が actualStore を伴わずに
   * bought へ遷移させるため、bought かつ actualStore が null は既に正当な状態）。
   * ただし未完了リストの bought 品目から actualStore が消えると、買い物完了時に
   * その品目の価格記録はスキップされる（記録先の店舗が存在しないため意図した挙動）。
   *
   * @returns 実際に参照を外したかどうか。false なら保存の必要がない
   */
  unassignStore(storeId: StoreId): boolean {
    let changed = false;

    if (this.itemTargetStore !== null && this.itemTargetStore.equals(storeId)) {
      this.itemTargetStore = null;
      changed = true;
    }
    if (this.itemActualStore !== null && this.itemActualStore.equals(storeId)) {
      this.itemActualStore = null;
      changed = true;
    }

    return changed;
  }

  /**
   * 価格・店舗を記録せずに購入済み（チェック済み）にする軽量操作。現状態を問わず 'bought' へ
   * 遷移する（markAsBought と同様、S-11 の「最新状態で上書き」思想を踏襲）。actualPrice /
   * actualStore には触れない。
   */
  check(): void {
    this.itemStatus = 'bought';
  }

  /**
   * チェックを外し 'pending' に戻す。actualPrice / actualStore も同時に null へ戻す
   * （チェックを外した後に再チェックしたとき、無関係になった古い価格が黙って買い物完了時の
   * 価格記録に使われてしまう事故を防ぐため）。
   * @throws Error status が 'bought' 以外の場合
   */
  uncheck(): void {
    if (this.itemStatus !== 'bought') {
      throw new Error(`Cannot uncheck a ShoppingItem with status '${this.itemStatus}'`);
    }
    this.itemStatus = 'pending';
    this.itemActualPrice = null;
    this.itemActualStore = null;
  }

  isBought(): boolean {
    return this.itemStatus === 'bought';
  }

  get id(): ShoppingItemId {
    return this.shoppingItemId;
  }

  get productId(): ProductId | null {
    return this.itemProductId;
  }

  get displayName(): string {
    return this.itemDisplayName;
  }

  get requiredAmount(): Quantity | null {
    return this.itemRequiredAmount;
  }

  get amountNote(): string | null {
    return this.itemAmountNote;
  }

  get targetStore(): StoreId | null {
    return this.itemTargetStore;
  }

  get status(): ItemStatus {
    return this.itemStatus;
  }

  get actualPrice(): Money | null {
    return this.itemActualPrice;
  }

  get actualStore(): StoreId | null {
    return this.itemActualStore;
  }

  get source(): ItemSource {
    return this.itemSource;
  }
}

export interface ShoppingListProps {
  id: ShoppingListId;
  mealPlanId: MealPlanId;
  items: ShoppingItem[];
  shoppingDate: Date;
  status: ShoppingListStatus;
  createdAt: Date;
}

export interface CreateShoppingListInput {
  mealPlanId: MealPlanId;
  items: ShoppingItem[];
  shoppingDate: Date;
}

/**
 * 買い物リスト集約。すべての更新操作（addItem / removeItem / markAsBought / reassignStore /
 * markAsSkipped / complete）は active 状態でのみ可能で、completed では Error を投げる。
 * 例外として reopen() のみ completed 状態で呼べ、active に戻す（買い物の再開）。
 */
export class ShoppingList {
  private constructor(
    private readonly shoppingListId: ShoppingListId,
    private readonly listMealPlanId: MealPlanId,
    private listItems: ShoppingItem[],
    private readonly listShoppingDate: Date,
    private listStatus: ShoppingListStatus,
    private readonly createdDate: Date,
  ) {}

  static create(input: CreateShoppingListInput): ShoppingList {
    return new ShoppingList(
      ShoppingListId.generate(),
      input.mealPlanId,
      [...input.items],
      new Date(input.shoppingDate),
      'active',
      new Date(),
    );
  }

  static reconstruct(props: ShoppingListProps): ShoppingList {
    return new ShoppingList(
      props.id,
      props.mealPlanId,
      [...props.items],
      new Date(props.shoppingDate),
      props.status,
      new Date(props.createdAt),
    );
  }

  addItem(item: ShoppingItem): void {
    this.assertActive('addItem');
    this.listItems.push(item);
  }

  /** @throws Error active でない、または itemId の品目が存在しない場合 */
  markAsBought(itemId: ShoppingItemId, price: Money, store: StoreId): void {
    this.assertActive('markAsBought');
    this.findItem(itemId).markAsBought(price, store);
  }

  /** @throws Error active でない、または itemId の品目が存在しない場合 */
  reassignStore(itemId: ShoppingItemId, newStore: StoreId): void {
    this.assertActive('reassignStore');
    this.findItem(itemId).reassignStore(newStore);
  }

  /** @throws Error active でない、itemId の品目が存在しない、または品目が pending 以外の場合 */
  markAsSkipped(itemId: ShoppingItemId): void {
    this.assertActive('markAsSkipped');
    this.findItem(itemId).markAsSkipped();
  }

  /** @throws Error active でない、または itemId の品目が存在しない場合 */
  check(itemId: ShoppingItemId): void {
    this.assertActive('check');
    this.findItem(itemId).check();
  }

  /** @throws Error active でない、itemId の品目が存在しない、または品目が bought 以外の場合 */
  uncheck(itemId: ShoppingItemId): void {
    this.assertActive('uncheck');
    this.findItem(itemId).uncheck();
  }

  /**
   * 品目をリストから取り除く（物理削除。ADR-0011）。誤って追加した品目を消すための操作で、
   * status / source を問わず削除できる。bought の品目を削除すると、その購入実績
   * （actualPrice / actualStore）も一緒に失われる。
   *
   * @throws Error active でない、または itemId の品目が存在しない場合
   */
  removeItem(itemId: ShoppingItemId): void {
    this.assertActive('removeItem');
    // 存在しない ID の削除を黙って成功させない（呼び出し側の取り違えを検出する）。
    this.findItem(itemId);
    this.listItems = this.listItems.filter((candidate) => !candidate.id.equals(itemId));
  }

  /**
   * 削除された店舗への参照を全品目から外す（ADR-0013 の店舗削除カスケード）。
   *
   * **`assertActive` を通さない。**他のすべての更新操作と異なり、これはユーザー操作ではなく
   * 「店舗が消えた」という集約の外側の事情による後始末である。過去の買い物（completed）も
   * 店舗を参照しているため、completed を除外すると宙ぶらりんの ID が残ってしまう。
   * `reopen()` に次ぐ 2 例目の状態チェック非経由メソッド。
   *
   * @returns 1 品目でも参照を外したかどうか。false なら保存の必要がない
   */
  unassignStore(storeId: StoreId): boolean {
    let changed = false;
    for (const item of this.listItems) {
      if (item.unassignStore(storeId)) {
        changed = true;
      }
    }
    return changed;
  }

  complete(): void {
    this.assertActive('complete');
    this.listStatus = 'completed';
  }

  /**
   * 完了済みの買い物リストを active に戻す（買い物を再開）。週の途中で買い足しがある運用向け。
   * 再度 complete() したときの在庫二重生成は CompleteShopping 側の品目単位冪等ガードで防ぐ。
   * @throws Error status が completed 以外の場合
   */
  reopen(): void {
    if (this.listStatus !== 'completed') {
      throw new Error(`Cannot reopen a ShoppingList with status '${this.listStatus}'`);
    }
    this.listStatus = 'active';
  }

  get id(): ShoppingListId {
    return this.shoppingListId;
  }

  get mealPlanId(): MealPlanId {
    return this.listMealPlanId;
  }

  /** 防御的コピーを返す。配列への変更は集約に反映されない。 */
  get items(): ShoppingItem[] {
    return [...this.listItems];
  }

  get shoppingDate(): Date {
    return new Date(this.listShoppingDate);
  }

  get status(): ShoppingListStatus {
    return this.listStatus;
  }

  get createdAt(): Date {
    return new Date(this.createdDate);
  }

  private assertActive(operation: string): void {
    if (this.listStatus !== 'active') {
      throw new Error(`Cannot ${operation} a ShoppingList with status '${this.listStatus}'`);
    }
  }

  private findItem(itemId: ShoppingItemId): ShoppingItem {
    const item = this.listItems.find((candidate) => candidate.id.equals(itemId)) ?? null;
    if (item === null) {
      throw new Error('ShoppingItem not found');
    }
    return item;
  }
}
