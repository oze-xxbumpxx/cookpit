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

```typescript
export class WeekIdentifier {
  private constructor(
    private readonly _year: number,
    private readonly _weekNumber: number,
  ) {}

  static fromDate(date: Date): WeekIdentifier {
    // ISO 8601 週番号で算出
  }

  static current(): WeekIdentifier {
    return WeekIdentifier.fromDate(new Date());
  }

  startDate(): Date {
    /* 土曜始まり想定（運用に合わせる） */
  }
  endDate(): Date {}
  next(): WeekIdentifier {}
  previous(): WeekIdentifier {}

  toString(): string {
    return `${this._year}-W${this._weekNumber}`;
  }
}
```

### Store

```typescript
export interface StoreCreateInput {
  name: string;
}

export interface StoreProps {
  id: StoreId;
  name: string;
  createdAt: Date;
}

export class Store {
  private constructor(
    private readonly storeId: StoreId,
    private readonly storeName: string,
    private readonly createdDate: Date,
  ) {}

  static create(input: StoreCreateInput): Store {
    if (input.name.trim() === '') {
      throw new Error('Store name is required');
    }
    return new Store(StoreId.generate(), input.name, new Date());
  }

  static reconstruct(props: StoreProps): Store {
    return new Store(props.id, props.name, new Date(props.createdAt));
  }

  get id(): StoreId {
    return this.storeId;
  }

  get name(): string {
    return this.storeName;
  }

  /** 防御的コピーを返す */
  get createdAt(): Date {
    return new Date(this.createdDate);
  }
}
```

Store のドメインモデルは実装済みで、`create` は店名必須のバリデーションを持つ（動的生成自体は可能）。MVP1 の運用では Store をシード（初期データ）として 2 件 DB に登録する。

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

### MealPlan 集約

週次の献立。ビュッフェ方式に対応するため、日付とレシピを 1:1 で固定しない柔軟な設計。

```typescript
export class MealPlan {
  private constructor(
    private readonly _id: MealPlanId,
    private readonly _weekOf: WeekIdentifier,
    private _plannedRecipes: PlannedRecipe[],
    private _status: MealPlanStatus,
    private readonly _createdAt: Date,
    private _completedAt: Date | null,
  ) {}

  static create(weekOf: WeekIdentifier): MealPlan {
    return new MealPlan(MealPlanId.generate(), weekOf, [], 'draft', new Date(), null);
  }

  static reconstruct(props: MealPlanProps): MealPlan {
    /* ... */
  }

  addRecipe(recipeId: RecipeId, scaleFactor: number = 1): PlannedRecipeId {
    if (this._status !== 'draft' && this._status !== 'shopping') {
      throw new Error('Cannot add recipe to a plan that is already cooking');
    }
    const planned = PlannedRecipe.create(recipeId, scaleFactor);
    this._plannedRecipes.push(planned);
    return planned.id;
  }

  removeRecipe(plannedRecipeId: PlannedRecipeId): void {
    /* ... */
  }

  scheduleForDay(plannedRecipeId: PlannedRecipeId, date: Date): void {
    const target = this._plannedRecipes.find((p) => p.id.equals(plannedRecipeId));
    if (!target) throw new Error('PlannedRecipe not found');
    target.scheduleFor(date);
  }

  markAsCooked(plannedRecipeId: PlannedRecipeId): void {
    const target = this._plannedRecipes.find((p) => p.id.equals(plannedRecipeId));
    if (!target) throw new Error('PlannedRecipe not found');
    target.markAsCooked(new Date());
  }

  /** ステータス遷移 */
  transitionTo(newStatus: MealPlanStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${this._status} to ${newStatus}`);
    }
    this._status = newStatus;
    if (newStatus === 'completed') this._completedAt = new Date();
  }

  private canTransitionTo(newStatus: MealPlanStatus): boolean {
    const transitions: Record<MealPlanStatus, MealPlanStatus[]> = {
      draft: ['shopping'],
      shopping: ['cooking', 'draft'],
      cooking: ['consuming'],
      consuming: ['completed'],
      completed: [],
    };
    return transitions[this._status].includes(newStatus);
  }
}

export class PlannedRecipe {
  private constructor(
    private readonly _id: PlannedRecipeId,
    private readonly _recipeId: RecipeId,
    private readonly _scaleFactor: number,
    private _scheduledDate: Date | null,
    private _cookedAt: Date | null,
    private _notes: string,
  ) {}

  static create(recipeId: RecipeId, scaleFactor: number = 1): PlannedRecipe {
    return new PlannedRecipe(PlannedRecipeId.generate(), recipeId, scaleFactor, null, null, '');
  }

  scheduleFor(date: Date): void {
    this._scheduledDate = date;
  }
  markAsCooked(at: Date): void {
    this._cookedAt = at;
  }
}

export type MealPlanStatus =
  | 'draft' // 献立検討中
  | 'shopping' // 買い物中
  | 'cooking' // 作り置き中
  | 'consuming' // 平日消費中
  | 'completed'; // 終了
```

#### 設計ポイント

- `scheduledDate` を nullable にすることで、ビュッフェ運用（日付なし）と日付指定運用の両方に対応
- `cookedAt` を持たせることで、「過去のレシピを見る」ユースケースを実現
- `MealPlanStatus` のステータス遷移ルールをドメイン内に閉じ込め
- 過去の献立を遡って参照できる（紙のレシピブックの代替として機能）

### ShoppingList 集約

買い物リスト。MealPlan + Pantry + Product から導出されるが、買い物中に独立して編集されるため独立集約とする。

```typescript
export class ShoppingList {
  private constructor(
    private readonly _id: ShoppingListId,
    private readonly _mealPlanId: MealPlanId,
    private _items: ShoppingItem[],
    private _shoppingDate: Date,
    private _status: ShoppingListStatus,
  ) {}

  static create(input: CreateShoppingListInput): ShoppingList {
    return new ShoppingList(
      ShoppingListId.generate(),
      input.mealPlanId,
      input.items,
      input.shoppingDate,
      'active',
    );
  }

  static reconstruct(props: ShoppingListProps): ShoppingList {
    /* ... */
  }

  addItem(item: ShoppingItem): void {
    this._items.push(item);
  }

  removeItem(itemId: ShoppingItemId): void {
    /* ... */
  }

  markAsBought(itemId: ShoppingItemId, actualPrice: Money, actualStore: StoreId): void {
    const item = this._items.find((i) => i.id.equals(itemId));
    if (!item) throw new Error('Item not found');
    item.markAsBought(actualPrice, actualStore);
  }

  reassignStore(itemId: ShoppingItemId, newStore: StoreId): void {
    /* ... */
  }

  complete(): void {
    if (this._status !== 'active') throw new Error('Already completed');
    this._status = 'completed';
  }

  /** 完了済みアイテムを Pantry に追加するためのデータを返す */
  getBoughtItemsForPantry(): BoughtItemForPantry[] {
    return this._items.filter((i) => i.isBought()).map((i) => i.toPantryEntry());
  }
}

export class ShoppingItem {
  private constructor(
    private readonly _id: ShoppingItemId,
    private readonly _productId: ProductId | null, // null 許容
    private _displayName: string,
    private readonly _requiredAmount: Quantity,
    private _targetStore: StoreId | null,
    private _status: ItemStatus,
    private _actualPrice: Money | null,
    private _actualStore: StoreId | null,
    private readonly _source: ItemSource,
  ) {}

  isBought(): boolean {
    return this._status === 'bought';
  }

  markAsBought(price: Money, store: StoreId): void {
    this._status = 'bought';
    this._actualPrice = price;
    this._actualStore = store;
  }
}

export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';
export type ShoppingListStatus = 'active' | 'completed';
```

### Pantry 集約

家にある食材を管理。買い物完了で自動追加、消費は手動。

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

```typescript
export class GenerateShoppingListUseCase {
  constructor(
    private mealPlanRepo: MealPlanRepository,
    private recipeRepo: RecipeRepository,
    private pantryRepo: PantryRepository,
    private productRepo: ProductRepository,
    private shoppingListRepo: ShoppingListRepository,
  ) {}

  async execute(mealPlanId: MealPlanId): Promise<ShoppingListId> {
    // 1. MealPlan を取得
    const mealPlan = await this.mealPlanRepo.findById(mealPlanId);
    if (!mealPlan) throw new Error('MealPlan not found');

    // 2. 含まれる Recipe をすべて取得
    const recipes = await this.recipeRepo.findByIds(mealPlan.plannedRecipes.map((p) => p.recipeId));

    // 3. 必要な食材を集計（倍量を反映）
    const requiredIngredients = this.aggregateIngredients(mealPlan, recipes);

    // 4. Pantry の在庫を引く
    const pantry = await this.pantryRepo.find();
    const toBuy = this.subtractStock(requiredIngredients, pantry);

    // 5. 各食材の最安店舗を決定
    const products = await this.productRepo.findByIds(
      toBuy.map((i) => i.productId).filter(Boolean),
    );
    const itemsWithStore = toBuy.map((item) => {
      const product = products.find((p) => p.id.equals(item.productId));
      const cheapest = product?.cheapestStoreAt(new Date());
      return { ...item, targetStore: cheapest };
    });

    // 6. ShoppingList を生成して保存
    const shoppingList = ShoppingList.create({
      mealPlanId: mealPlan.id,
      items: itemsWithStore.map((i) => ShoppingItem.create(i)),
      shoppingDate: new Date(),
    });
    await this.shoppingListRepo.save(shoppingList);

    // 7. MealPlan のステータスを shopping に
    mealPlan.transitionTo('shopping');
    await this.mealPlanRepo.save(mealPlan);

    return shoppingList.id;
  }

  private aggregateIngredients(mealPlan, recipes) {
    /* ... */
  }
  private subtractStock(required, pantry) {
    /* ... */
  }
}
```

### 買い物完了時に Pantry を更新する

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

### 4. 過去の MealPlan の保持期間

履歴が無限に増える。当面は削除しないが、Phase 2 で「6ヶ月以前のデータはアーカイブ」のような方針を検討。

### 5. ステータス遷移の自動化

現状はユーザーの明示的な操作で遷移するが、「買い物リスト全アイテムが bought になったら自動で cooking に」のような自動化は Phase 2 で。
