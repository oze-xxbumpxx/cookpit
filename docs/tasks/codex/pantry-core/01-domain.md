# Task 1: Domain 層 — Quantity.subtract() + Pantry 集約

## 概要

`packages/domain/src/pantry/` に `Pantry` 集約一式を新規作成し、共有 VO `Quantity` に
`subtract()` を追加する。**模範コード**: `packages/domain/src/shopping-list/shopping-list.ts`
（集約が子エンティティを配列で持ち、防御的コピー・private helper を持つ構造）、
`packages/domain/src/product/product-id.ts`（ID VO のパターン）。

依存: なし（既存 `packages/domain` のみに依存）。

## アーキテクチャ制約（必ず遵守）

- `packages/domain` は他のパッケージに依存しない。Drizzle・HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==` / 「値なし」は `null`
- Domain 内の throw は shopping-list/meal-plan 先例に合わせ**単純 `Error` + メッセージ**
  （エラークラスへの変換は Application 層 = Task 3 の責務）
- 公開メソッドの JSDoc は**型に表せない契約情報のみ**（不変条件・`@throws`・冪等性）

## 実装対象ファイル

| 種別 | ファイル                                          | 内容                                                                                        |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 追記 | `packages/domain/src/shared/quantity.ts`          | `subtract(other: Quantity): Quantity` 追加（S-7）                                           |
| 追記 | `packages/domain/src/shared/quantity.test.ts`     | `subtract()` のテストケース追加                                                             |
| 新規 | `packages/domain/src/pantry/pantry-id.ts`         | `PantryId`（`fromString`/`equals`/`value` + `singleton()`。**`generate()` は持たない**）    |
| 新規 | `packages/domain/src/pantry/stock-id.ts`          | `StockId`（`ProductId` パターン完全踏襲）                                                   |
| 新規 | `packages/domain/src/pantry/pantry.ts`            | `Pantry` 集約 + `Stock` エンティティ + `StorageLocation` 型 + 入力型（IMP-7・単一ファイル） |
| 新規 | `packages/domain/src/pantry/pantry.repository.ts` | `PantryRepository` IF                                                                       |
| 新規 | `packages/domain/src/pantry/pantry-id.test.ts`    | `PantryId` 単体テスト                                                                       |
| 新規 | `packages/domain/src/pantry/stock-id.test.ts`     | `StockId` 単体テスト                                                                        |
| 新規 | `packages/domain/src/pantry/pantry.test.ts`       | `Pantry`/`Stock` 集約テスト                                                                 |

`packages/domain/src/index.ts` は**変更しない**（IMP-8）。

## 1. `Quantity.subtract()`（そのまま実装）

`packages/domain/src/shared/quantity.ts` に追記（`add`/`multiply` と同文型・純追加）:

```typescript
/** @throws Error 単位が一致しない、または結果が負値になる場合（`Quantity.of` の検証に委ねる） */
subtract(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot subtract different units');
  }
  return Quantity.of(this.quantityValue - other.quantityValue, this.quantityUnit);
}
```

## 2. `PantryId`（そのまま実装）

```typescript
// packages/domain/src/pantry/pantry-id.ts
const SINGLETON_VALUE = '00000000-0000-0000-0000-000000000000';

/** 単一世帯を表す固定 ID（S-1）。DB にも API 契約にも現れない、集約の同一性表現専用。 */
export class PantryId {
  private constructor(private readonly pantryIdValue: string) {}

  static fromString(value: string): PantryId {
    return new PantryId(value);
  }

  /** 常にこの固定値を返す。`generate()` は持たない（Pantry は採番されない。D-2）。 */
  static singleton(): PantryId {
    return new PantryId(SINGLETON_VALUE);
  }

  equals(other: PantryId): boolean {
    return this.pantryIdValue === other.pantryIdValue;
  }

  get value(): string {
    return this.pantryIdValue;
  }
}
```

## 3. `StockId`

`packages/domain/src/product/product-id.ts` の `private constructor` / `static generate()`
（`randomUUID`）/ `static fromString()` / `equals()` / `get value()` を**一字一句踏襲**する。
プロパティ名は `stockIdValue`。

## 4. `Pantry` 集約 + `Stock` エンティティ（`pantry.ts`。そのまま実装）

```typescript
import type { ProductId } from '../product/product-id';
import { Quantity } from '../shared/quantity';
import type { ShoppingItemId } from '../shopping-list/shopping-item-id';
import { PantryId } from './pantry-id';
import { StockId } from './stock-id';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry'; // D-2: プレーン union

export interface CreateStockInput {
  productId: ProductId | null;
  displayName: string;
  amount: Quantity;
  purchasedAt: Date;
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
  sourceShoppingItemId: ShoppingItemId | null;
}

export interface StockProps {
  id: StockId;
  productId: ProductId | null;
  displayName: string;
  amount: Quantity;
  purchasedAt: Date;
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
  sourceShoppingItemId: ShoppingItemId | null;
}

export class Stock {
  private constructor(
    private readonly stockId: StockId,
    private readonly stockProductId: ProductId | null,
    private readonly stockDisplayName: string,
    private stockAmount: Quantity,
    private readonly stockPurchasedAt: Date,
    private readonly stockExpiresAt: Date | null,
    private readonly stockStoredLocation: StorageLocation | null,
    private readonly stockSourceShoppingItemId: ShoppingItemId | null,
  ) {}

  /** @throws Error displayName が空白のみ、または amount が 0 以下の場合 */
  static create(input: CreateStockInput): Stock {
    if (input.displayName.trim() === '') {
      throw new Error('Display name is required');
    }
    if (input.amount.value <= 0) {
      throw new Error('Stock amount must be positive');
    }

    return new Stock(
      StockId.generate(),
      input.productId,
      input.displayName,
      input.amount,
      input.purchasedAt,
      input.expiresAt,
      input.storedLocation,
      input.sourceShoppingItemId,
    );
  }

  static reconstruct(props: StockProps): Stock {
    return new Stock(
      props.id,
      props.productId,
      props.displayName,
      props.amount,
      props.purchasedAt,
      props.expiresAt,
      props.storedLocation,
      props.sourceShoppingItemId,
    );
  }

  /**
   * 消費量が現在量以上の場合は全量消費（残 0）にクランプする（S-7 案 α）。
   *
   * @throws Error amount の単位が現在量の単位と一致しない場合
   */
  consume(amount: Quantity): void {
    if (amount.unit !== this.stockAmount.unit) {
      throw new Error('Cannot consume with a different unit');
    }
    this.stockAmount =
      amount.value >= this.stockAmount.value
        ? Quantity.of(0, this.stockAmount.unit)
        : this.stockAmount.subtract(amount);
  }

  isEmpty(): boolean {
    return this.stockAmount.value === 0;
  }

  get id(): StockId {
    return this.stockId;
  }
  get productId(): ProductId | null {
    return this.stockProductId;
  }
  get displayName(): string {
    return this.stockDisplayName;
  }
  get amount(): Quantity {
    return this.stockAmount;
  }
  get purchasedAt(): Date {
    return new Date(this.stockPurchasedAt);
  }
  get expiresAt(): Date | null {
    return this.stockExpiresAt === null ? null : new Date(this.stockExpiresAt);
  }
  get storedLocation(): StorageLocation | null {
    return this.stockStoredLocation;
  }
  get sourceShoppingItemId(): ShoppingItemId | null {
    return this.stockSourceShoppingItemId;
  }
}

export interface PantryProps {
  id: PantryId;
  stocks: Stock[];
}

/**
 * 在庫（Pantry）集約。単一世帯に常にちょうど 1 つ存在する（S-1）。
 * 「1 買い物完了品目 : 最大 1 Stock」はこの集約単体では保証できず、
 * Application 層の事前スキップ + DB の source_shopping_item_id UNIQUE の
 * 二段で守る（S-3）。
 */
export class Pantry {
  private constructor(
    private readonly pantryId: PantryId,
    private pantryStocks: Stock[],
  ) {}

  static create(): Pantry {
    return new Pantry(PantryId.singleton(), []);
  }

  static reconstruct(props: PantryProps): Pantry {
    return new Pantry(props.id, [...props.stocks]);
  }

  addStock(input: CreateStockInput): StockId {
    const stock = Stock.create(input);
    this.pantryStocks.push(stock);
    return stock.id;
  }

  /** @throws Error stockId の Stock が存在しない、または amount の単位が一致しない場合 */
  consumeStock(stockId: StockId, amount: Quantity): void {
    const stock = this.findStock(stockId);
    stock.consume(amount);
    if (stock.isEmpty()) {
      this.pantryStocks = this.pantryStocks.filter((candidate) => !candidate.id.equals(stockId));
    }
  }

  /**
   * 残量に関わらず全量を集約から取り除く（部分廃棄はない）。
   *
   * @throws Error stockId の Stock が存在しない場合
   */
  discardStock(stockId: StockId): void {
    this.findStock(stockId);
    this.pantryStocks = this.pantryStocks.filter((candidate) => !candidate.id.equals(stockId));
  }

  /** 買い物完了の再実行時、同一 ShoppingItem 由来の Stock 追加をスキップする判定に使う（S-3）。 */
  hasStockFromShoppingItem(itemId: ShoppingItemId): boolean {
    return this.pantryStocks.some(
      (stock) => stock.sourceShoppingItemId !== null && stock.sourceShoppingItemId.equals(itemId),
    );
  }

  get id(): PantryId {
    return this.pantryId;
  }

  get stocks(): Stock[] {
    return [...this.pantryStocks];
  }

  private findStock(stockId: StockId): Stock {
    const stock = this.pantryStocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new Error('Stock not found');
    }
    return stock;
  }
}
```

## 5. `PantryRepository`（そのまま実装）

```typescript
// packages/domain/src/pantry/pantry.repository.ts
import type { Pantry } from './pantry';

export interface PantryRepository {
  /** 単一世帯の Pantry を返す。在庫 0 件でも空の Pantry を返す（null を返さない）。 */
  find(): Promise<Pantry>;
  save(pantry: Pantry): Promise<void>;
}
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- `ProductId`/`ShoppingItemId` は本ファイル内で型としてのみ使用するため **`import type`** で統一
  （`Quantity` は `Quantity.of` を呼ぶため通常 import）
- **クランプと厳格 throw の責務分離**（S-7・取り違え注意）: `Quantity.subtract()` は負値で
  **throw**（VO は厳格）。全量クランプは **`Stock.consume()`** の責務（`>=` 比較で
  `Quantity.of(0, unit)` に落とす）。逆にしない
- `PantryId` に `generate()` を実装しない（`singleton()` のみ。D-2）
- **全 getter の防御的コピー**を徹底（`purchasedAt`/`expiresAt` は `new Date(...)`、
  `Pantry.stocks` は `[...]`）。忘れると Application 層が Domain 内部状態を書き換える事故になる
- クラス名・識別子の綴り: `Pantry` / `Stock` / `StockId` / `PantryId` / `StorageLocation` /
  `CreateStockInput` / `hasStockFromShoppingItem` / `consumeStock` / `discardStock` / `isEmpty`

## テスト

**`quantity.test.ts` 追記**: 同一単位の減算（`300g - 100g = 200g`）／異なる単位で
`'Cannot subtract different units'` を throw／減算結果が負値になる場合 `Quantity.of` 由来の
エラーで throw／`x - 0 = x`／`x - x = 0`。

**`pantry-id.test.ts`**: `singleton()` を 2 回呼んでも同じ `value`・`equals` が true／
`fromString` で復元した値が `value` に反映される。

**`stock-id.test.ts`**: `generate()` が異なる値を返す／`fromString` の往復／`equals` の真偽。

**`pantry.test.ts`**:

- `Stock.create()`: displayName 空白で throw／`amount.value <= 0` で throw／正常系で全フィールド
  設定（`productId`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` **すべて null のケースも
  成功する**。S-5/S-4/S-3）
- `Stock.consume()`: 単位不一致で throw／消費量 < 在庫量で減算結果になる／**消費量 = 在庫量で
  0 にクランプ・`isEmpty()` が true（境界）**／**消費量 > 在庫量でも 0 にクランプ**（負値にならない）
- `Stock.isEmpty()`: amount 0 で true・非 0 で false
- 防御性: `purchasedAt`/`expiresAt` の getter が防御的コピーを返す
- `Pantry.create()`: `stocks: []`・`id` が `PantryId.singleton()` と等価
- `Pantry.addStock()`: 追加後 `stocks` に反映・返り値 `StockId` が追加 Stock と一致
- `Pantry.consumeStock()`: 未検出 stockId で throw（`'Stock not found'`）／**消費後に残量 0 に
  なった Stock が `stocks` から消える**／0 にならない場合は残る
- `Pantry.discardStock()`: 未検出で throw／残量に関わらず対象が消える
- `Pantry.hasStockFromShoppingItem()`: 一致あり → true／`sourceShoppingItemId` null のみ →
  false／不一致 → false
- 防御性: `Pantry.stocks` getter が防御的コピー（取得配列への push が内部に影響しない）

## 完了条件

- [ ] `pnpm --filter @cookpit/domain test` 全 green
- [ ] `pnpm --filter @cookpit/domain type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `packages/domain` 内の依存が `node:crypto` と同パッケージ内の型参照のみ（Drizzle・HTTP なし）
- [ ] S-5（productId null 許容）・S-7（subtract 厳格 + consume クランプ）・S-3
      （`hasStockFromShoppingItem`）がテストで担保されている
- [ ] `packages/domain/src/index.ts` が無変更（IMP-8）
