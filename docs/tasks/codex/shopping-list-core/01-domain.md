# Task 1: Domain 層 — Quantity.add() + ShoppingList 集約

## 概要

`packages/domain` に `shopping-list` 集約（`ShoppingList` / `ShoppingItem` / ID VO 2 種 /
Repository IF）を新規実装し、共有 VO `Quantity` に `add()` を追加する。
**模範コード（必ず開いてパターンを踏襲すること）**:

- `packages/domain/src/meal-plan/meal-plan.ts` — 集約の private helper 構造（`assertActive` 相当）
- `packages/domain/src/recipe/recipe-ingredient.ts` — `amount`/`amountNote` 排他検証ロジック
- `packages/domain/src/product/product-id.ts` — ID VO のパターン
- `packages/domain/src/shared/money.ts` — `add()` の文型

依存: なし（既存 `packages/domain` のみ。他パッケージへの依存なし）。

## アーキテクチャ制約（必ず遵守）

- `packages/domain` は他のパッケージに依存しない。**Drizzle・HTTP の型を持ち込まない**
- Entity 生成は `static create()`（ID 採番・検証を含む）、DB 復元は `static reconstruct()`
  （検証を通さない）
- `any` 禁止（`unknown` を使う）。**default export 禁止**（名前付きエクスポートのみ）
- 型のみのインポートは **`import type`**。`===` / `!==` のみ使用。「値なし」は `null` に統一
- コメントは Why が非自明な場合のみ
- Domain 内の throw は**単純 `Error` + メッセージ**（MealPlan 先例）。エラークラスへの変換は
  Application 層（Task 3）が担う

## 実装対象ファイル

| 種別 | ファイル                                                        | 内容                                                      |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------- |
| 追記 | `packages/domain/src/shared/quantity.ts`                        | `add(other: Quantity): Quantity` を追加（S-4）            |
| 追記 | `packages/domain/src/shared/quantity.test.ts`                   | `add()` のテストケース追加                                |
| 新規 | `packages/domain/src/shopping-list/shopping-list-id.ts`         | `ShoppingListId`（`ProductId` パターン踏襲）              |
| 新規 | `packages/domain/src/shopping-list/shopping-item-id.ts`         | `ShoppingItemId`（同上）                                  |
| 新規 | `packages/domain/src/shopping-list/shopping-list.ts`            | `ShoppingList` 集約 + `ShoppingItem` エンティティ + 型3種 |
| 新規 | `packages/domain/src/shopping-list/shopping-list.repository.ts` | `ShoppingListRepository` IF                               |
| 新規 | `packages/domain/src/shopping-list/shopping-list-id.test.ts`    | `ShoppingListId` 単体テスト                               |
| 新規 | `packages/domain/src/shopping-list/shopping-item-id.test.ts`    | `ShoppingItemId` 単体テスト                               |
| 新規 | `packages/domain/src/shopping-list/shopping-list.test.ts`       | `ShoppingList`/`ShoppingItem` 集約テスト                  |

## 1. `Quantity.add()`（`quantity.ts` へ追記）

```typescript
add(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot add different units');
  }
  return Quantity.of(this.quantityValue + other.quantityValue, this.quantityUnit);
}
```

`Money.add()` と同文型。既存呼び出し箇所（Recipe/Product/MealPlan は `of`/`multiply` のみ使用）へ
影響しない純追加。既存のプロパティ名（`quantityValue` / `quantityUnit`）は実ファイルで確認し、
実在の名前に合わせること（勝手に改名しない）。

## 2. `ShoppingListId` / `ShoppingItemId`

`packages/domain/src/product/product-id.ts` を一字一句パターン踏襲する:
`private constructor` / `static generate()`（`node:crypto` の `randomUUID`）/
`static fromString()` / `equals()` / `get value()`。
private プロパティ名は `shoppingListIdValue` / `shoppingItemIdValue`。

## 3. `ShoppingList` 集約 + `ShoppingItem` エンティティ（`shopping-list.ts`）

以下のシグネチャ・識別子名を**正確に**実装する（実装計画 §Task 1 から転記。省略なしの完全形）:

```typescript
import type { Money } from '../shared/money';
import type { Quantity } from '../shared/quantity';
import type { StoreId } from '../shared/store';
import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { ProductId } from '../product/product-id';
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

  // S-11(a)(b): 現 status を問わず上書き許容（bought の再適用・skipped→bought いずれも許容）
  markAsBought(price: Money, store: StoreId): void {
    this.itemStatus = 'bought';
    this.itemActualPrice = price;
    this.itemActualStore = store;
  }

  // S-9: pending → skipped のみ許可。bought→skipped を許すと actualPrice/actualStore が
  // 残ったままの不整合状態になるため不可（bought の訂正は Unit B で扱う）
  markAsSkipped(): void {
    if (this.itemStatus !== 'pending') {
      throw new Error(`Cannot skip a ShoppingItem with status '${this.itemStatus}'`);
    }
    this.itemStatus = 'skipped';
  }

  // S-11(c): targetStore のみ変更。actualPrice/actualStore には触れない
  reassignStore(newStore: StoreId): void {
    this.itemTargetStore = newStore;
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

  markAsBought(itemId: ShoppingItemId, price: Money, store: StoreId): void {
    this.assertActive('markAsBought');
    this.findItem(itemId).markAsBought(price, store);
  }

  reassignStore(itemId: ShoppingItemId, newStore: StoreId): void {
    this.assertActive('reassignStore');
    this.findItem(itemId).reassignStore(newStore);
  }

  markAsSkipped(itemId: ShoppingItemId): void {
    this.assertActive('markAsSkipped');
    this.findItem(itemId).markAsSkipped();
  }

  // S-8: active 以外からの呼び出しは reject。Sprint 4 では呼び出す API がないため実質未到達だが
  // 集約の不変条件として実装する
  complete(): void {
    this.assertActive('complete');
    this.listStatus = 'completed';
  }

  get id(): ShoppingListId {
    return this.shoppingListId;
  }
  get mealPlanId(): MealPlanId {
    return this.listMealPlanId;
  }
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

  // D-2: items 変更系操作すべてに active ガード
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
```

## 4. `ShoppingListRepository`（`shopping-list.repository.ts`）

```typescript
import type { MealPlanId } from '../meal-plan/meal-plan-id';
import type { ShoppingList } from './shopping-list';
import type { ShoppingListId } from './shopping-list-id';

export interface ShoppingListRepository {
  findById(id: ShoppingListId): Promise<ShoppingList | null>;
  findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>;
  save(shoppingList: ShoppingList): Promise<void>;
}
```

`delete` は Sprint 4 スコープ外のため**定義しない**。

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- 識別子の綴りを上記コードと一字一句照合すること（例: `ShoppingItemId` を `ShoppingItemID` や
  `ShopingItemId` にしない。`requiredAmount` を `requiredAmout` にしない）
- `MealPlanId` / `ProductId` / `StoreId` / `Money` / `Quantity` は本ファイルでは型のみ使用のため
  **`import type` で統一**（`PlannedRecipe` が `RecipeId` を `import type` する先例と同じ）
- エラーメッセージは上記の文字列を**そのまま**使う（テストが文字列一致で検証する）
- getter は防御的コピーを徹底（`items` は `[...]`、`shoppingDate`/`createdAt` は `new Date(...)`）。
  返し忘れると Application 層から Domain 内部状態を書き換えられる事故につながる

## テスト（co-located `*.test.ts`・Vitest）

`quantity.test.ts` への追加:

- 同一単位の加算（`100g + 200g = 300g`）
- 異なる単位で `'Cannot add different units'` を throw
- `0 + x = x`

`shopping-list-id.test.ts` / `shopping-item-id.test.ts`（`product-id.test.ts` のパターン踏襲）:

- `generate()` が UUID 形式・毎回異なる値／`fromString()` 往復／`equals()` の一致・不一致

`shopping-list.test.ts`:

- `ShoppingItem.create()`: displayName 空白で throw／`requiredAmount`/`amountNote` 両方 null で
  throw／両方非 null で throw／`requiredAmount` のみ・`amountNote` のみでそれぞれ成功／初期値
  `status='pending'`・`actualPrice=null`・`actualStore=null`
- `ShoppingItem.markAsBought()`: pending→bought／既に bought の item への再適用で上書き（S-11a）／
  skipped の item への適用（S-11b、skipped→bought）
- `ShoppingItem.reassignStore()`: `targetStore` のみ変更、`status='bought'` の item に適用しても
  `actualPrice`/`actualStore` は変わらない（S-11c）
- `ShoppingItem.markAsSkipped()`: pending→skipped／**bought から throw・skipped から throw**
  （`'Cannot skip a ShoppingItem with status ...'`）
- `ShoppingItem.isBought()`: bought で true、それ以外で false
- `ShoppingList.create()`: `status='active'`、`createdAt` が設定される
- `ShoppingList.addItem()`: active で成功／`status='completed'` で throw（D-2）
- `ShoppingList.markAsBought()`: active で成功／completed で throw／存在しない itemId で throw
  （`'ShoppingItem not found'`）
- `ShoppingList.reassignStore()` / `ShoppingList.markAsSkipped()`: 同様の active ガード・item 未検出
- `ShoppingList.complete()`: active→completed／completed への二重呼び出しで throw（S-8）
- 防御性: `items`/`shoppingDate` の getter が防御的コピーを返す（取得配列への `push`／取得 Date の
  変更が内部状態に影響しない）

## 完了条件

- [ ] `pnpm --filter @cookpit/domain test` 全 green
- [ ] `pnpm --filter @cookpit/domain type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `Quantity.add()`・`ShoppingListId`・`ShoppingItemId`・`ShoppingItem`・`ShoppingList`・
      `ShoppingListRepository` がすべて実装されている
- [ ] `packages/domain` 内の依存が `node:crypto` と同パッケージ内の型参照のみ
      （Drizzle・HTTP の型を持ち込んでいない）
- [ ] S-5 の排他検証・D-2 の active ガード・S-9 の pending ガード・S-11 の寛容方針（上書き許容）が
      テストで担保されている
