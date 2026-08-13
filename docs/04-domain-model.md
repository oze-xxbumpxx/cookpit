# 04. ドメインモデル設計

## 集約一覧

MVP1 における 5 つの集約。

| 集約         | 役割                                           |
| ------------ | ---------------------------------------------- |
| Recipe       | レシピブックのデジタル化、調理手順と材料の管理 |
| MealPlan     | 週次の献立、ビュッフェ方式運用に対応           |
| ShoppingList | 買い物リスト、価格比較、買い物中の編集         |
| Pantry       | 在庫管理、購入で増え消費で減る                 |
| Product      | 商品マスタ、店舗別の価格履歴                   |

## 集約間の関係図

```
Recipe ←──── MealPlan ────→ ShoppingList
   │             │                 │
   │             │                 │
   ↓             ↓                 ↓
Product (← 価格履歴 / 商品マスタ →)
   ↑                              │
   │                              │
   └────────── Pantry ←───────────┘
```

- 集約間の参照はすべて **ID 参照**（DDD の原則）
- 集約をまたぐ操作は Application Layer の Use Case で組み立てる

## 共通の値オブジェクト

複数の集約で共有される値オブジェクト。

### Money

```typescript
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: Currency,
  ) {}

  static of(amount: number, currency: Currency = 'JPY'): Money {
    if (amount < 0) throw new Error('Money must be non-negative');
    return new Money(amount, currency);
  }

  add(other: Money): Money {
    /* ... */
  }
  multiply(factor: number): Money {
    /* ... */
  }
  isLessThan(other: Money): boolean {
    /* ... */
  }

  get amount(): number {
    return this._amount;
  }
  get currency(): Currency {
    return this._currency;
  }
}
```

### Quantity

```typescript
export class Quantity {
  private constructor(
    private readonly _value: number,
    private readonly _unit: Unit,
  ) {}

  static of(value: number, unit: Unit): Quantity {
    if (value < 0) throw new Error('Quantity must be non-negative');
    return new Quantity(value, unit);
  }

  multiply(factor: number): Quantity {
    /* ... */
  }
  add(other: Quantity): Quantity {
    /* 単位が同じなら加算可能 */
  }
  toGrams(): number {
    /* 重量系の単位なら g に正規化 */
  }
}

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'piece' | 'pinch';
```

### WeekIdentifier

> 実装済み（Sprint 3 Unit A / ADR-0005）。ISO 8601 週番号は不採用。
> 週は「直近の土曜日を開始日とする 7 日間（土曜〜金曜）」。内部は週開始日の `Date`、
> 外部表現は `"YYYY-MM-DD"`（例: `"2026-07-04"`）。

```typescript
export class WeekIdentifier {
  private constructor(private readonly weekStartDate: Date) {}

  static fromDate(date: Date): WeekIdentifier {
    // 直前の土曜へスナップ（daysFromSaturday = (getDay() + 1) % 7）
  }

  static current(): WeekIdentifier {
    return WeekIdentifier.fromDate(new Date());
  }

  static fromString(value: string): WeekIdentifier {
    // 'T00:00:00' を付与してローカル解釈し、fromDate 経由で土曜へスナップ
  }

  startDate(): Date {}
  endDate(): Date {} // 開始日 + 6 日（金曜 23:59:59.999）
  next(): WeekIdentifier {}
  previous(): WeekIdentifier {}
  equals(other: WeekIdentifier): boolean {}

  toString(): string {
    // getFullYear/getMonth/getDate から "YYYY-MM-DD" を組み立て（toISOString は使わない）
  }
}
```

### Store

```typescript
export class Store {
  private constructor(
    private readonly _id: StoreId,
    private readonly _name: string,
  ) {}

  static create(name: string): Store {
    return new Store(StoreId.generate(), name);
  }

  static reconstruct(id: StoreId, name: string): Store {
    return new Store(id, name);
  }
}
```

> **現行実装は上記より進んでいる。**「シードのみ・動的追加は Phase 2 以降」の想定は撤回済みで、
> 価格記録フォームから追加・削除できる。あわせて 2026-07-27 に
> [ADR-0013](./decisions/ADR-0013-store-limit-and-delete-cascade.md) で次の不変条件が入った。
>
> - **登録は最大 3 件**（実運用の「2 人で 2〜3 店舗を回る」に合わせた実数）
> - **同名は登録不可**（`normalizeStoreName` = 前後空白除去 + NFKC 後の完全一致で判定）
> - **削除は参照ごとカスケード**（価格記録は物理削除、買い物品目の店舗指定は未割当へ戻す）
>
> どちらも単一の `Store` では判定できないコレクション制約なので、Entity ではなく
> `CreateStoreUseCase` / `DeleteStoreUseCase`（Application 層）が担う。
>
> 2026-08 に [ADR-0015](./decisions/ADR-0015-store-rename-for-typo-correction.md) で
> `rename(name: string): void` が追加された（誤字訂正用。`_name` の `readonly` は外れている）。
> 同名検査（自分自身を除く既存店舗との一致判定）は `Store.rename()` 単体では行わず、
> `RenameStoreUseCase` が担う（`CreateStoreUseCase` と同じ責務分担）。

## 集約詳細

### Recipe 集約

レシピのデジタル化を担う。集約ルートは `Recipe`。

```typescript
export class Recipe {
  private constructor(
    private readonly _id: RecipeId,
    private _name: string,
    private _ingredients: RecipeIngredient[],
    private _steps: CookingStep[],
    private _baseServings: number,
    private _servings: number | null,
    private _tags: RecipeTag[],
    private _cookingTime: Duration | null,
    private _notes: string,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(input: CreateRecipeInput): Recipe {
    if (input.name.trim() === '') throw new Error('Recipe name required');
    if (input.baseServings <= 0) throw new Error('Servings must be positive');

    const now = new Date();
    return new Recipe(
      RecipeId.generate(),
      input.name,
      input.ingredients,
      input.steps,
      input.baseServings,
      input.servings ?? null,
      input.tags ?? [],
      input.cookingTime ?? null,
      input.notes ?? '',
      now,
      now,
    );
  }

  static reconstruct(props: RecipeProps): Recipe {
    /* ... */
  }

  // 振る舞い
  rename(name: string): void {
    if (name.trim() === '') throw new Error('Recipe name required');
    this._name = name;
    this._updatedAt = new Date();
  }

  // servings（何人前・任意の表示用アノテーション。baseServingsとは別概念）
  updateServings(servings: number | null): void {
    if (servings !== null && (!Number.isInteger(servings) || servings <= 0)) {
      throw new Error('Servings must be a positive integer or null');
    }
    this._servings = servings;
    this._updatedAt = new Date();
  }

  addIngredient(ingredient: RecipeIngredient): void {
    this._ingredients.push(ingredient);
    this._updatedAt = new Date();
  }

  removeIngredient(index: number): void {
    /* ... */
  }

  /** 倍量計算：scaleFactor 倍にした材料リストを返す */
  scaleIngredients(scaleFactor: number): RecipeIngredient[] {
    return this._ingredients.map((ing) => ing.scale(scaleFactor));
  }
}

// 値オブジェクト：レシピ内の材料
export class RecipeIngredient {
  private constructor(
    private readonly _productRef: ProductId | null, // null 許容（マスタ未登録）
    private readonly _displayName: string,
    private readonly _amount: Quantity,
  ) {}

  scale(factor: number): RecipeIngredient {
    return new RecipeIngredient(this._productRef, this._displayName, this._amount.multiply(factor));
  }
}

// 値オブジェクト：調理手順
export class CookingStep {
  constructor(
    public readonly order: number,
    public readonly description: string,
  ) {}
}

export type RecipeTag = '主菜' | '副菜' | '汁物' | '作り置き向き' | '冷凍可' | string;
```

#### 設計ポイント

- `RecipeIngredient.productRef` を nullable にすることで、レシピ作成時にいちいち Product マスタに登録する必要がない（実用性優先）
- 買い物リスト生成時に名寄せして Product を確定するフローを取る
- `scaleIngredients()` は買い物リスト生成時に Use Case 側で呼ばれる

### Product 集約

商品マスタ + 価格履歴。価格比較機能の中核。

```typescript
export class Product {
  private constructor(
    private readonly _id: ProductId,
    private _name: string,
    private _aliases: string[], // 「玉ねぎ」「タマネギ」などの別名
    private _category: ProductCategory,
    private _defaultUnit: Unit,
    private _priceHistory: PriceRecord[],
  ) {}

  static create(input: CreateProductInput): Product {
    /* ... */
  }
  static reconstruct(props: ProductProps): Product {
    /* ... */
  }

  /** 価格を記録する */
  recordPrice(record: PriceRecord): void {
    this._priceHistory.push(record);
  }

  /** 指定店舗の最新価格 */
  latestPriceAt(storeId: StoreId): Money | null {
    const records = this._priceHistory
      .filter((r) => r.storeId.equals(storeId))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    return records[0]?.price ?? null;
  }

  /** 指定時点で最も安い店舗 */
  cheapestStoreAt(date: Date): StoreId | null {
    // 各店舗の date 直近の価格を取得して比較
  }

  /** 指定店舗の期間平均価格 */
  averagePrice(storeId: StoreId, periodDays: number): Money | null {}

  /** 現在価格が過去比で安いかを判定 */
  isPriceLow(storeId: StoreId, currentPrice: Money): boolean {
    const avg = this.averagePrice(storeId, 90);
    if (!avg) return false;
    return currentPrice.isLessThan(avg);
  }
}

export class PriceRecord {
  constructor(
    public readonly storeId: StoreId,
    public readonly price: Money,
    public readonly unitPrice: Money, // 100g あたりなどに正規化
    public readonly packageSize: Quantity,
    public readonly observedAt: Date,
  ) {}
}

export type ProductCategory = '野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | string;
```

#### 設計ポイント

- `priceHistory` を集約内に持つことで、価格判定ロジック（最安、平均、安いか）をドメインに閉じ込められる
- 履歴が増え続けると集約が肥大化する懸念があるが、2人利用・週1回の買い物では数年運用しても問題なし
- パフォーマンスが課題になったら、履歴を別の読み取りモデルに切り出す
- `unitPrice`（100g あたり等）が地味に重要。「1袋300g 500円」と「1袋500g 700円」を比較するのに必要

> 上記コードは `recordPrice()` / `removePriceRecord()` を反映していない既知のギャップに加えて、
> 2026-08 に `updatePriceRecord(priceRecordId, props): void` が追加された（誤字訂正・単位変更
> 用途。ADR-0015 と同時期の Sprint 7 タスク2）。`id` と `observedAt` は編集前後で維持し、
> 内部では新しい `PriceRecord` を生成して配列内の該当要素を置換する（`PriceRecord` は不変）。

### MealPlan 集約

週次の献立。ビュッフェ方式に対応するため、日付とレシピを 1:1 で固定しない柔軟な設計。
実装済み（Sprint 3 Unit A）。詳細は `docs/designs/meal-plan-core.md` / ADR-0005。

```typescript
export type MealPlanStatus =
  | 'draft' // 献立検討中
  | 'shopping' // 買い物中（ShoppingList 生成後。遷移 UI は Sprint 4）
  | 'cooking' // 作り置き中
  | 'consuming' // 平日消費中
  | 'completed'; // 終了

export class MealPlan {
  private constructor(
    private readonly mealPlanId: MealPlanId,
    private readonly mealPlanWeekOf: WeekIdentifier,
    private mealPlanPlannedRecipes: PlannedRecipe[],
    private mealPlanStatus: MealPlanStatus,
    private readonly createdDate: Date,
    private completedDate: Date | null,
  ) {}

  static create(weekOf: WeekIdentifier): MealPlan {
    return new MealPlan(MealPlanId.generate(), weekOf, [], 'draft', new Date(), null);
  }

  static reconstruct(props: MealPlanProps): MealPlan {
    /* ... */
  }

  addRecipe(recipeId: RecipeId, scaleFactor: number): PlannedRecipeId {
    // draft / shopping のみ可。scaleFactor は Domain で > 0 を検証
  }

  removeRecipe(plannedRecipeId: PlannedRecipeId): void {
    // draft / shopping のみ可。未検出は Error
  }

  scheduleForDay(plannedRecipeId: PlannedRecipeId, date: Date): void {
    /* PlannedRecipe.scheduleFor */
  }

  markAsCooked(plannedRecipeId: PlannedRecipeId, at: Date): void {
    /* PlannedRecipe.markAsCooked。調理記録 UI は Sprint 3 対象外 */
  }

  transitionTo(newStatus: MealPlanStatus): void {
    // draft→shopping / shopping→draft|cooking / cooking→consuming /
    // consuming→completed。completed は終端。API 公開は Sprint 3 対象外
  }
}

export class PlannedRecipe {
  private constructor(
    private readonly plannedRecipeId: PlannedRecipeId,
    private readonly plannedRecipeRecipeId: RecipeId,
    private readonly plannedRecipeScaleFactor: number,
    private scheduledDateValue: Date | null,
    private cookedAtValue: Date | null,
    private readonly plannedRecipeNotes: string,
  ) {}

  static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe {
    // scaleFactor <= 0 は Error。notes 初期値は ''
  }

  static reconstruct(props: PlannedRecipeProps): PlannedRecipe {
    /* ... */
  }

  scheduleFor(date: Date): void {}
  markAsCooked(at: Date): void {}
}
```

#### 設計ポイント

- `scheduledDate` を nullable にすることで、ビュッフェ運用（日付なし）と日付指定運用の両方に対応
- `cookedAt` を持たせることで、「過去のレシピを見る」ユースケースを実現
- `MealPlanStatus` のステータス遷移ルールをドメイン内に閉じ込め（遷移 UI は Sprint 4 連動）
- 過去の献立を遡って参照できる（紙のレシピブックの代替として機能）
- 削除済み Recipe への参照は `recipeId` のみ保持（カスケード削除しない。C-4）

### ShoppingList 集約

買い物リスト。MealPlan + Product から導出されるが、買い物中に独立して編集されるため独立集約とする。
Pantry 在庫の引き算は行わない（S-2。Pantry 集約は Sprint 5 スコープ）。

（2026-07-13 Sprint 4 Unit A 実装に同期。確定値 S-1〜S-11 / D-1〜D-8 は
`docs/designs/shopping-list-core.md` を正典とする）

```typescript
export class ShoppingList {
  private constructor(
    private readonly _id: ShoppingListId,
    private readonly _mealPlanId: MealPlanId,
    private _items: ShoppingItem[],
    private readonly _shoppingDate: Date,
    private _status: ShoppingListStatus,
    private readonly _createdAt: Date,
  ) {}

  static create(input: CreateShoppingListInput): ShoppingList {
    /* status: 'active'・createdAt: 現在時刻で初期化 */
  }

  static reconstruct(props: ShoppingListProps): ShoppingList {
    /* ... */
  }

  // 更新系操作はすべて active のみ許可（completed なら throw。D-2 assertActive）
  addItem(item: ShoppingItem): void {}
  markAsBought(itemId: ShoppingItemId, price: Money, store: StoreId): void {}
  reassignStore(itemId: ShoppingItemId, newStore: StoreId): void {}
  markAsSkipped(itemId: ShoppingItemId): void {}
  complete(): void {}
}

export class ShoppingItem {
  private constructor(
    private readonly _id: ShoppingItemId,
    private readonly _productId: ProductId | null, // null 許容（名寄せは productRef 引き継ぎのみ。S-3）
    private readonly _displayName: string,
    private _requiredAmount: Quantity | null, // amountNote と「ちょうど一方が非 null」の排他（S-5）
    private _amountNote: string | null, // 「適量」などの自由記述
    private _targetStore: StoreId | null, // 最安店舗が決定できない場合は null（D-1）
    private _status: ItemStatus,
    private _actualPrice: Money | null,
    private _actualStore: StoreId | null,
    private readonly _source: ItemSource,
  ) {}

  markAsBought(price: Money, store: StoreId): void {} // 現状態を問わず最新実績で上書き（S-11）
  markAsSkipped(): void {} // pending のみ許可。bought / skipped からは throw（S-9）
  reassignStore(newStore: StoreId): void {} // bought 後も可。actualPrice / actualStore には影響しない（S-11）
  isBought(): boolean {}
}

export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';
export type ShoppingListStatus = 'active' | 'completed';
```

#### 設計ポイント

- `requiredAmount: Quantity | null` + `amountNote: string | null` で「適量」を表現。**ちょうど一方が非 null**（S-5）
- 更新系操作（addItem / markAsBought / reassignStore / markAsSkipped / complete）はすべて
  `status === 'active'` ガード（D-2）
- `markAsSkipped` / `complete()` は Domain 実装のみで API 非公開（S-8 / S-9）
- `getBoughtItemsForPantry()` は実装しない。Pantry 連携（CompleteShoppingUseCase）とともに Sprint 5 で設計（S-8）
- `removeItem`（品目の物理削除）は 2026-07-25 に実装（下記の実装追記を参照）
- `shoppingDate = mealPlan.weekOf.startDate()`（週開始土曜固定）。DB は `date` 型・ローカル日付整形で
  JST 前日ずれを回避（S-10）
- `shopping_items` は別テーブル（JSONB 不採用）・`shopping_lists.meal_plan_id` に UNIQUE 制約
  （S-1。生成冪等 S-6 の基盤）

> 実装追記（2026-08-13, `docs/designs/meal-plan-sync.md` / ADR-0018）: `ShoppingItem` に
> `updateRequiredAmount(amount)` を追加した。`pending` 以外と amountNote 品目（`requiredAmount` が
> null）は拒否する。`source` は Domain では見ない（対象の絞り込みは Application の責務）。
> `ShoppingList` にも `assertActive` 付きの薄いラッパー `updateItemRequiredAmount(itemId, amount)`
> を追加した。献立同期は `from_meal_plan` かつ `pending` の品目だけ削除・数量上書きする。
> `bought`（画面のチェック済みを含む）と手動追加は触らない。

> 実装追記（2026-07-25, `docs/designs/shopping-item-remove.md` / ADR-0011）: `ShoppingList` に
> `removeItem(itemId)` を追加した。`assertActive('removeItem')` を通し、存在しない itemId は
> `Error('ShoppingItem not found')`。**status / source を問わず削除できる**（`bought` の品目を
> 削除すると購入実績 `actualPrice` / `actualStore` も一緒に失われる）。永続化は
> `DrizzleShoppingListRepository.save()` の既存の `notInArray` 差分削除がそのまま追随するため、
> リポジトリ実装と DB スキーマは無変更。既存の `markAsSkipped()` は引き続き API 非公開のまま残す
> （物理削除と skipped の使い分けの根拠は ADR-0011）。なお献立由来の品目を削除しても、
> `SyncShoppingListFromMealPlanUseCase`（ADR-0007 の差分マージ）は削除を記憶しないため
> 再同期で再び追加される。

> 実装追記（2026-07-24, `docs/designs/shopping-list-item-check.md`）: `ShoppingItem` に
> `check()`（価格・店舗に触れず `bought` へ遷移）/ `uncheck()`（`bought` からのみ許可し `pending` に
> 戻すと同時に `actualPrice`/`actualStore` を `null` にクリア。`bought` 以外から呼ぶと `Error`）を
> 追加した。`ShoppingList` にも `assertActive` ガード付きの薄いラッパー `check(itemId)` /
> `uncheck(itemId)` を追加している。これにより **`ItemStatus.bought` は「価格記録済み」を含意
> しなくなった**（`SetItemCheckedUseCase` 経由で価格・店舗なしの `bought` が生成されうる）。
> 既存の `markAsBought(price, store)` / `markAsSkipped()` / `reassignStore()` は無変更。
> `CompleteShoppingUseCase` は元々 `actualPrice === null || actualStore === null` のとき価格記録を
> スキップする分岐を実装済みのため、追加改修は不要だった。正典は
> `packages/domain/src/shopping-list/shopping-list.ts` と
> `docs/designs/shopping-list-item-check.md`。

### Pantry 集約

家にある食材を管理。買い物完了で自動追加、在庫画面から手動追加も可能、消費は手動。

> 実装追記（2026-07-24, `docs/designs/pantry-manual-add.md`）: 在庫画面から在庫を手動で追加できる
> （`AddStockUseCase` → `Pantry.addStock`）。手動追加分は `productId=null` /
> `sourceShoppingItemId=null`（買い物完了由来の冪等キー非該当）で登録される。「追加＝常に新規 Stock」で
> あり、既存 Stock への加算は行わない。なお本セクション以下のコード例は設計初期版で現行実装と乖離が
> ある（`storedLocation`/`productId` は null 許容、`ConsumptionReason` は撤廃、消費はクランプ方式）。
> 正典は `packages/domain/src/pantry/pantry.ts` と `docs/designs/pantry-core.md`。

> 実装追記（2026-07-25, `docs/designs/shopping-complete-stock-selection.md`）: Stock の生成経路は
> 2 系統ある。**在庫画面からの手動追加**（`sourceShoppingItemId: null`）と、**買い物完了時の選択追加**
> （`sourceShoppingItemId` に買い物品目 ID を設定）。後者は購入した品目のうち画面で選んだものだけを
> 在庫化する（購入＝自動在庫化ではない）。`sourceShoppingItemId` は
> `Pantry.hasStockFromShoppingItem()`（Application 側の事前スキップ）と DB の UNIQUE 制約の二段で
> 「1 買い物品目 : 最大 1 Stock」を守り、買い物再開 → 再完了での二重在庫を防ぐ。

```typescript
export class Pantry {
  private constructor(
    private readonly _id: PantryId,
    private _stocks: Stock[],
  ) {}

  static create(): Pantry {
    return new Pantry(PantryId.generate(), []);
  }

  static reconstruct(props: PantryProps): Pantry {
    /* ... */
  }

  /** 買い物完了時に呼ばれる：自動 */
  addStock(input: AddStockInput): StockId {
    const stock = Stock.create(input);
    this._stocks.push(stock);
    return stock.id;
  }

  /** 「使った」を記録：手動 */
  consumeStock(stockId: StockId, amount: Quantity, reason: ConsumptionReason): void {
    const stock = this._stocks.find((s) => s.id.equals(stockId));
    if (!stock) throw new Error('Stock not found');
    stock.consume(amount, reason);

    // 量がゼロになったら削除
    if (stock.isEmpty()) {
      this._stocks = this._stocks.filter((s) => !s.id.equals(stockId));
    }
  }

  /** 「捨てた」を記録：手動 */
  discardStock(stockId: StockId, reason: string): void {
    const stock = this._stocks.find((s) => s.id.equals(stockId));
    if (!stock) throw new Error('Stock not found');
    stock.discard(reason);
    this._stocks = this._stocks.filter((s) => !s.id.equals(stockId));
  }

  /** 賞味期限が近い在庫を取得（Phase 2 で活用） */
  findExpiringSoon(daysAhead: number): Stock[] {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);
    return this._stocks.filter((s) => s.expiresAt !== null && s.expiresAt <= threshold);
  }

  /** 商品 ID で在庫を取得（FIFO 順） */
  findByProduct(productId: ProductId): Stock[] {
    return this._stocks
      .filter((s) => s.productId.equals(productId))
      .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  }

  /** 在庫を引いて、買うべき量を計算（買い物リスト生成で使用） */
  calculateRequiredAmount(productId: ProductId, neededAmount: Quantity): Quantity {
    const stocks = this.findByProduct(productId);
    const availableTotal = stocks.reduce(
      (sum, s) => sum.add(s.amount),
      Quantity.of(0, neededAmount.unit),
    );
    return neededAmount.subtract(availableTotal); // 負になったら 0 を返す実装
  }
}

export class Stock {
  private constructor(
    private readonly _id: StockId,
    private readonly _productId: ProductId,
    private _amount: Quantity,
    private readonly _purchasedAt: Date,
    private readonly _expiresAt: Date | null,
    private readonly _storedLocation: StorageLocation,
  ) {}

  consume(amount: Quantity, reason: ConsumptionReason): void {
    this._amount = this._amount.subtract(amount);
  }

  discard(reason: string): void {
    /* ログ用に記録 */
  }

  isEmpty(): boolean {
    return this._amount.value === 0;
  }
  isExpired(now: Date): boolean {
    /* ... */
  }
}

export type ConsumptionReason = 'cooked' | 'eaten' | 'other';
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';
```

#### 設計ポイント

- 同一商品でも購入時期が異なれば別 Stock として管理（FIFO 消費が可能）
- 「使った」と「捨てた」を区別することで、Phase 2 の食材ロス分析の基盤になる
- 量を追わない簡易管理ではなく、量も追跡する設計（消費は手動なので量はざっくりでもOK）

## ユースケースの主要なオーケストレーション例

複数の集約をまたぐ操作は Application Layer に置く。

### 献立から買い物リストを生成する

（2026-07-13 実装に同期。`packages/application/src/shopping-list/generate-shopping-list.use-case.ts` が実体）

```typescript
export class GenerateShoppingListUseCase {
  constructor(
    private mealPlanRepo: MealPlanRepository,
    private recipeRepo: RecipeRepository,
    private productRepo: ProductRepository, // Pantry は注入しない（S-2。在庫引き算は Sprint 5）
    private shoppingListRepo: ShoppingListRepository,
  ) {}

  async execute(input: GenerateShoppingListInputDto): Promise<GenerateShoppingListResultDto> {
    // 1. MealPlan を取得（なければ MealPlanNotFoundError）
    // 2. 冪等ガード（S-6）: 既存リストがあれば新規生成せずそれを返す（created: false）。
    //    その際 MealPlan が draft のままなら shopping へ遷移させ、部分失敗状態を自己修復する
    // 3. 既存リストがなく MealPlan が draft 以外なら InvalidMealPlanStateError
    // 4. PlannedRecipe の Recipe を findById ループで解決（D-4）。削除済み Recipe はスキップ（D-8）
    // 5. 材料を集計（倍量反映）: 同一キー（productId ?? displayName.trim()）+ 同一単位のみ
    //    Quantity.add() で合算（S-4）。Pantry 在庫の引き算はしない（S-2）
    // 6. productId を持つ品目のみ Product.cheapestStoreAt() で最安店舗を決定。
    //    決定できない場合は targetStore = null（D-1）
    // 7. ShoppingList.create()（shoppingDate = mealPlan.weekOf.startDate()。S-10）→ 保存
    // 8. MealPlan を shopping へ遷移 → 保存（保存順 = リスト → MealPlan。S-6）
    // 9. { shoppingList, created: true } を返す（ルート層で新規 201・冪等時 200）
  }
}
```

### 買い物完了時に Pantry を更新する

（**Sprint 5 スコープ・未実装の構想**。`getBoughtItemsForPantry()` を含め、
Pantry 集約の設計時に再設計して確定する — S-8）

```typescript
export class CompleteShoppingUseCase {
  constructor(
    private shoppingListRepo: ShoppingListRepository,
    private pantryRepo: PantryRepository,
    private productRepo: ProductRepository,
    private mealPlanRepo: MealPlanRepository,
  ) {}

  async execute(shoppingListId: ShoppingListId): Promise<void> {
    const shoppingList = await this.shoppingListRepo.findById(shoppingListId);
    if (!shoppingList) throw new Error('ShoppingList not found');

    // 1. 買ったアイテムを Pantry に追加
    const pantry = await this.pantryRepo.find();
    for (const boughtItem of shoppingList.getBoughtItemsForPantry()) {
      pantry.addStock(boughtItem);
    }
    await this.pantryRepo.save(pantry);

    // 2. 価格履歴を Product に記録
    for (const boughtItem of shoppingList.getBoughtItemsForPantry()) {
      if (boughtItem.productId && boughtItem.actualPrice) {
        const product = await this.productRepo.findById(boughtItem.productId);
        product.recordPrice(/* PriceRecord */);
        await this.productRepo.save(product);
      }
    }

    // 3. ShoppingList を完了に
    shoppingList.complete();
    await this.shoppingListRepo.save(shoppingList);

    // 4. MealPlan を cooking に
    const mealPlan = await this.mealPlanRepo.findById(shoppingList.mealPlanId);
    mealPlan.transitionTo('cooking');
    await this.mealPlanRepo.save(mealPlan);
  }
}
```

## 設計上の論点（実装時に再検討する余地あり）

### 1. Product の名寄せ問題

「玉ねぎ」と「タマネギ」を同じ Product と認識する仕組み。MVP1 では `aliases` で手動管理するが、入力時の Auto-suggest UX が課題になる。

### 2. Quantity の単位変換

レシピは「大さじ2」、買い物は「100g」など単位が違うことがある。MVP1 では完全な変換は実装せず、Product ごとの「デフォルト単位」で揃える運用にする。

### 3. ShoppingList 生成時の在庫引き算

端数処理をどうするか。「玉ねぎ 2個必要、家に 0.5 個ある → 2 個買う」のような切り上げルールを Use Case 側で持つ。

→ **Sprint 4 で確定（S-2）**: 生成時の在庫引き算は行わない（Pantry 集約自体が Sprint 5 スコープ）。
切り上げルールは Sprint 5 の Pantry 連携設計で扱う。

### 4. 過去の MealPlan の保持期間

履歴が無限に増える。当面は削除しないが、Phase 2 で「6ヶ月以前のデータはアーカイブ」のような方針を検討。

### 5. ステータス遷移の自動化

現状はユーザーの明示的な操作で遷移するが、「買い物リスト全アイテムが bought になったら自動で cooking に」のような自動化は Phase 2 で。
