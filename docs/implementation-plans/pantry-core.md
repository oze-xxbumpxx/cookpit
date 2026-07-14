# 実装計画: pantry-core

- ステータス: ready
- 設計書: `docs/designs/pantry-core.md`（確定。S-1〜S-11 は 2026-07-14 ユーザー確定。
  §契約 は `docs/designs/pantry-core-contract.md`）
- 要件定義: `docs/requirements/pantry-core.md`
- 実装ルート: **Codex 委譲**（`docs/06-ai-tools.md` §実装ルートの使い分け /
  `docs/claude-code/orchestration-policy.md` §実装ルートの分岐）。**implementer は起動しない。**
  `create-codex-brief` 以降（`docs/tasks/codex/pantry-core/` への指示書分割・生成・Codex 実行・
  レビュー）はメインエージェント側で実施する。本計画は「Codex への実装指示書に落とし込める粒度」で
  各作業単位を自己完結的に記述する（先例: `docs/implementation-plans/shopping-list-core.md`）。

---

## 概要

新規集約 `Pantry`（+ 集約内エンティティ `Stock`）を Domain / Infrastructure / Application /
API Contract / Presentation(API) の全層に縦断して新規実装し、`ShoppingList` の `complete()` を
初めて外部公開経路（買い物完了 API）でつなぐ。核心は 4 集約（ShoppingList / Pantry / Product /
MealPlan）をまたぐ `CompleteShoppingUseCase` の冪等性・保存順序による部分失敗の自己修復
（S-3・ADR-0006 の直系）。画面(UI)は対象外（Unit B `pantry-screens`）。在庫引き算連携
（Generate への Pantry 注入）も対象外（Unit C）。

実装順序は設計書 §implementation-planner への申し送りのとおり **Domain（Quantity.subtract +
Pantry 集約 + Repository IF）→ Infrastructure（schema → migration → repository）→
Application（Pantry 3 UseCase → CompleteShoppingUseCase + DTO/Mapper/エラー）→
API Contract（Zod）→ Presentation（route → app.ts）→ 各層テスト → 品質ゲート**。
shopping-list-core（Sprint 4 Unit A）と同一の層別 5 分割を踏襲し、Codex タスクも 5 本に分割する。

---

## 前提（確定済み。実装中に変更しない）

設計書冒頭の確定記録どおり、S-1〜S-11・D-1〜D-8 は全件ユーザー確定済み（2026-07-14）。以下は
実装で必ず踏襲する確定値の要約（詳細根拠は設計書 §設計判断リストを参照）。

| ID          | 確定内容                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1         | `PantryRepository.find(): Promise<Pantry>`（引数なし・常に非 null）+ `PantryId.singleton()` 固定定数。GetPantry は常に 200                                                       |
| S-2         | `stocks` 単一テーブル（`pantries` テーブルなし）+ `source_shopping_item_id` UNIQUE                                                                                               |
| S-3         | 買い物完了は冪等成功（B2）+ 4 段保存順序（Pantry→Product→ShoppingList→MealPlan）による自己修復 + UNIQUE 二重追加防止。価格記録のみ非冪等性を許容（案 B）。ADR 化推奨（ADR-0007） |
| S-4         | `getBoughtItemsForPantry()` は作らない。Application 層で `item.isBought()` filter + 変換（案 B）。`expiresAt`/`storedLocation` は null（案 α）                                   |
| S-5         | `Stock.productId: ProductId \| null` + `displayName: string` の両方採用（案 A）                                                                                                  |
| S-6         | `requiredAmount = null` の bought 品目は `Quantity.of(1, '個')` として登録（案 A）                                                                                               |
| S-7         | `Quantity.subtract()` は負値で throw（案 A）。過剰消費は `Stock.consume` が全量消費にクランプ（案 α）                                                                            |
| S-8         | `actualPrice = 0` は価格記録をスキップ（Stock 追加は行う。案 A）                                                                                                                 |
| S-9         | `requiredAmount` を `packageSize` に転用して価格記録。スキップ条件 5 種（案 A、詳細は Task 3）                                                                                   |
| S-10        | MVP1 では consume/discard に `reason` を受け取らない（案 A）                                                                                                                     |
| S-11        | `calculateRequiredAmount`/`findByProduct`/`findExpiringSoon` は本ユニットで実装しない（案 A）                                                                                    |
| D-1         | `CompleteShoppingUseCase` は `application/src/shopping-list/` に配置。API は `POST /api/shopping-lists/:id/complete`                                                             |
| D-2         | `StorageLocation` はプレーン文字列 union。ID VO は 4 点セット（`PantryId` のみ `singleton()` を持ち `generate()` を持たない）                                                    |
| D-3         | Consume/Discard の戻り値は更新後 `PantryDto`（全在庫）                                                                                                                           |
| D-4         | 完了時の MealPlan 遷移は「不存在ならスキップ・draft なら二段遷移で修復・shopping なら一段遷移・その他は何もしない」                                                              |
| D-5         | 価格記録は unique productId でグルーピングし N+1 を緩和（Product 1 件につき findById 1 回・save 1 回）                                                                           |
| D-6         | `consumeStockSchema.amount.value` は `z.number().positive()`（0 を reject）。`unit` は `unitSchema` 再利用                                                                       |
| D-7         | `PantryDto` に Pantry の id を含めない（`{ stocks: StockDto[] }` のみ）                                                                                                          |
| D-8         | 集約またぎ ID 参照（`product_id`/`source_shopping_item_id`）に FK を張らない                                                                                                     |
| 契約 §1〜§9 | `docs/designs/pantry-core-contract.md` が Zod/Drizzle/Hono の詳細確定形（本計画はこれを転記・参照する）                                                                          |

---

## 実装計画作成時に判明した設計書との差異・補足（要 Codex ブリーフ反映）

設計書・契約書に明記されていないが、実リポジトリ構成の確認により実装に必須と判明した事項、
および「Codex への指示書に落とし込む」ために技術的に決める必要があった配線の詳細。
shopping-list-core の IMP-1〜IMP-7 と同じ性質（設計判断の変更ではなく機械的な整合・設計書が
明示的に implementation-planner へ委ねた判断）のため、Orchestrator への差し戻しは不要と判断した。

| #     | 差異・補足                                                             | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 対応                         |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| IMP-1 | マイグレーション出力先・採番                                           | `apps/web/drizzle.config.ts` の `out: './src/db/migrations'` により出力先は **`apps/web/src/db/migrations/`**。現在の最大連番は `0006_previous_jamie_braddock.sql`（shopping-list-core で使用済み・実ファイル確認済み）のため、本ユニットの生成物は **`0007_xxxxx.sql`**（アドジェクティブ-ノウン部分は `drizzle-kit generate` が自動採番するため執筆時点では確定しない）                                                                                                                                                                                                                                                                                                                                                                                                                                            | Task 2                       |
| IMP-2 | PGlite テスト DDL                                                      | `packages/infrastructure/src/testing/create-test-db.ts` は migrations を使わず `schema.ts` と手動同期した DDL 文字列を PGlite に直接適用している。`stocks` の `CREATE TABLE`/`CREATE INDEX` をこの DDL に追記しないと `drizzle-pantry.repository.test.ts` が全滅する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Task 2                       |
| IMP-3 | JSDoc 規約の適用                                                       | `.claude/rules/coding-standards.md`「公開 API には JSDoc を書く（2026-07-12 採用・shopping-list 以降の新規コードに適用）」は pantry-core にも適用される（実コード確認済み: `shopping-list.ts`/`mark-as-bought.use-case.ts` に既に適用済み）。設計書のコード片自体には JSDoc がないため、本計画のコード例で型に表せない契約情報（不変条件・`@throws`・冪等性）のみを JSDoc化する形を明示する                                                                                                                                                                                                                                                                                                                                                                                                                          | 全 Task                      |
| IMP-4 | `CompleteShoppingInputDto` の配置先                                    | 設計書 §Application 設計のコード例は Pantry 系 DTO と並べて掲載されているが、D-1（CompleteShoppingUseCase は `shopping-list/` に配置）と、`GenerateShoppingListInputDto`/`GetShoppingListInputDto` 等が既に `shopping-list.dto.ts` に定義されている既存パターンに合わせ、**`shopping-list.dto.ts` に追記**する（`pantry.dto.ts` には含めない）                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Task 3                       |
| IMP-5 | `complete-shopping` のテストファイル分割（設計書が明示的に委ねた判断） | 設計書「§変更後構成」は「complete-shopping のテストは既存 `shopping-list-use-cases.test.ts` へ追加 or 単独ファイル。実装計画で確定」と明記。既存 `shopping-list-use-cases.test.ts`（700 行超）は `InMemoryMealPlanRepository`/`InMemoryProductRepository`/`InMemoryShoppingListRepository` を既に定義済みだがモジュール非公開（他ファイルから import 不可）。**独立ファイル `complete-shopping.use-case.test.ts` を新設**し、必要な InMemory フェイク（MealPlan/Product/ShoppingList/Pantry の 4 種）をこのファイル内にローカル定義する（`product-use-cases.test.ts`/`meal-plan-use-cases.test.ts` 等、各ファイルが独自にフェイクを持つ既存パターンに倣う）。理由: (1) 冪等・3 種の部分失敗修復・価格記録スキップ 5 条件など試験ケース数が多く独立させた方が可読性が高い、(2) 既存ファイルのこれ以上の肥大化を避ける | Task 3                       |
| IMP-6 | 価格記録ループの save タイミング（D-5 の字義どおりの実装）             | D-5「Product 1 件につき findById 1 回・save 1 回」を字義どおり実装する: productId でグループ化した後、各グループで `findById` が非 null なら記録可否に関わらず **常に 1 回 `save`** する（S-9 のスキップにより 1 件も `recordPrice` されなかった場合も save 自体は実行される＝空更新で無害）。条件分岐で save をスキップする最適化はしない（実装をシンプルに保ち、Codex の実装ゆらぎを避けるため）                                                                                                                                                                                                                                                                                                                                                                                                                   | Task 3                       |
| IMP-7 | Pantry 集約のファイル構成                                              | 設計書「§変更後構成」どおり `Stock`/`Pantry`/`StorageLocation`/`CreateStockInput` を単一ファイル `packages/domain/src/pantry/pantry.ts` にまとめる（`ShoppingItem`+`ShoppingList` が `shopping-list.ts` に同居する既存 precedent と同型）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Task 1                       |
| IMP-8 | `packages/domain/src/index.ts` は無変更                                | 同ファイルは実質未使用（中身はコメントのみ）。Application 層は `@cookpit/domain/src/pantry/pantry` のような深いパスで直接 import するため、pantry 追加でも `domain/src/index.ts` への追記は不要（既存 shopping-list 追加時も無変更だった事実と整合）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Task 1（対応不要の確認のみ） |

---

## Codex タスク分割（5 タスク・番号順に実行）

`docs/implementation-plans/shopping-list-core.md` と同じ形式（層単位・1 指示書=1PR 相当）で
分割する。各タスクは自己完結（前タスクの成果物への依存のみで、後続タスクの内容を先取りしない）。

| #   | 対象層             | 概要                                                                                                                                       |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Domain             | `Quantity.subtract()` / `PantryId` / `StockId` / `Pantry` 集約 + `Stock` エンティティ + `StorageLocation` / `PantryRepository` IF + テスト |
| 2   | Infrastructure     | DB スキーマ追記（`stocks`）/ PGlite DDL 追記 / マイグレーション生成 / `DrizzlePantryRepository` 実装 + テスト                              |
| 3   | Application        | Pantry DTO / Mapper / エラー2種 / UseCase 3本（Consume/Discard/GetPantry）→ `CompleteShoppingUseCase`（4集約またぎ・D-1）+ テスト          |
| 4   | API Contract       | `pantry.schema.ts`（Zod）+ 契約テスト                                                                                                      |
| 5   | Presentation (API) | `routes/pantry.ts` 新設 + `routes/shopping-lists.ts` 追記（complete）+ `app.ts` 統合（マウント + onError 2分岐追記）                       |

---

### Task 1: Domain 層 — Quantity.subtract() + Pantry 集約

**依存**: なし（既存 `packages/domain` のみに依存）

**対象ファイル**

| 種別 | ファイル                                          | 内容                                                                                      |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 追記 | `packages/domain/src/shared/quantity.ts`          | `subtract(other: Quantity): Quantity` 追加（S-7）                                         |
| 追記 | `packages/domain/src/shared/quantity.test.ts`     | `subtract()` のテストケース追加                                                           |
| 新規 | `packages/domain/src/pantry/pantry-id.ts`         | `PantryId`（`fromString`/`equals`/`value` + `singleton()`。`generate()` は持たない。D-2） |
| 新規 | `packages/domain/src/pantry/stock-id.ts`          | `StockId`（`ProductId` パターン完全踏襲）                                                 |
| 新規 | `packages/domain/src/pantry/pantry.ts`            | `Pantry` 集約 + `Stock` エンティティ + `StorageLocation` 型 + 入力型（IMP-7）             |
| 新規 | `packages/domain/src/pantry/pantry.repository.ts` | `PantryRepository` IF                                                                     |
| 新規 | `packages/domain/src/pantry/pantry-id.test.ts`    | `PantryId` 単体テスト                                                                     |
| 新規 | `packages/domain/src/pantry/stock-id.test.ts`     | `StockId` 単体テスト                                                                      |
| 新規 | `packages/domain/src/pantry/pantry.test.ts`       | `Pantry`/`Stock` 集約テスト                                                               |

#### 1-1. `Quantity.subtract()`（設計 §S-7 のコードをそのまま実装）

```typescript
// packages/domain/src/shared/quantity.ts に追記
/** @throws Error 単位が一致しない、または結果が負値になる場合（`Quantity.of` の検証に委ねる） */
subtract(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot subtract different units');
  }
  return Quantity.of(this.quantityValue - other.quantityValue, this.quantityUnit);
}
```

`add`/`multiply` と同文型。既存呼び出し箇所（Recipe/Product/ShoppingList/MealPlan は
`of`/`multiply`/`add` のみ使用）への影響はない純追加。

**追加テスト（`quantity.test.ts`）**: 同一単位の減算（`300g - 100g = 200g`）／異なる単位で
`'Cannot subtract different units'` を throw／減算結果が負値になる場合 `Quantity.of` 由来の
エラーで throw／`x - 0 = x`／`x - x = 0`。

#### 1-2. `PantryId` / `StockId`

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

**追加テスト（`pantry-id.test.ts`）**: `singleton()` を2回呼んでも同じ `value`／`equals` が
true になる／`fromString` で復元した値が `value` に反映される。

`StockId`（`stock-id.ts`）は `packages/domain/src/product/product-id.ts` の
`private constructor`／`static generate()`（`randomUUID`）／`static fromString()`／
`equals()`／`get value()` を一字一句踏襲する（プロパティ名は `stockIdValue`）。

**追加テスト（`stock-id.test.ts`）**: `generate()` が異なる値を返す／`fromString` の往復／
`equals` の真偽。

#### 1-3. `Pantry` 集約 + `Stock` エンティティ（`pantry.ts`。IMP-7）

**模範コード**: `packages/domain/src/shopping-list/shopping-list.ts`（集約が子エンティティを
配列で持ち、防御的コピー・`findItem` 相当の private helper を持つ構造）。

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

**注意（コーディング規約遵守）**: `ProductId`/`ShoppingItemId` は本ファイル内では型としてのみ
使用するため `import type` で統一する（`Quantity` は `Quantity.of` を呼ぶため通常 import）。
Domain 内の throw は shopping-list/meal-plan 先例に合わせ単純 `Error` + メッセージとする。
Application 層でエラークラスに変換する（Task 3）。

#### 1-4. `PantryRepository`（`pantry.repository.ts`）

```typescript
import type { Pantry } from './pantry';

export interface PantryRepository {
  /** 単一世帯の Pantry を返す。在庫 0 件でも空の Pantry を返す（null を返さない）。 */
  find(): Promise<Pantry>;
  save(pantry: Pantry): Promise<void>;
}
```

#### 追加テスト（`pantry.test.ts`）

- `Stock.create()`: displayName 空白で throw／`amount.value <= 0` で throw／正常系で
  `id`/`productId`/`displayName`/`amount`/`purchasedAt`/`expiresAt`/`storedLocation`/
  `sourceShoppingItemId` が設定される（`productId`/`expiresAt`/`storedLocation`/
  `sourceShoppingItemId` すべて null のケースも成功する。S-5/S-4/S-3）
- `Stock.consume()`: 単位不一致で throw／消費量 < 在庫量で `subtract` 相当の結果になる／
  消費量 = 在庫量で 0 にクランプ・`isEmpty()` が true（境界）／消費量 > 在庫量でも 0 に
  クランプされる（S-7 案 α。負値にならない）
- `Stock.isEmpty()`: amount 0 で true、非 0 で false
- 防御性: `purchasedAt`/`expiresAt` の getter が防御的コピーを返す
- `Pantry.create()`: `stocks: []`・`id` が `PantryId.singleton()` と等価
- `Pantry.addStock()`: 追加後 `stocks` に反映される・返り値の `StockId` が追加された Stock と
  一致する
- `Pantry.consumeStock()`: 未検出 stockId で throw（`'Stock not found'`）／消費後に残量が
  0 になった Stock が `stocks` から消える（削除規則）／0 にならない場合は `stocks` に残る
- `Pantry.discardStock()`: 未検出 stockId で throw／残量に関わらず対象が `stocks` から消える
  （部分廃棄がないことの確認）
- `Pantry.hasStockFromShoppingItem()`: 一致する `sourceShoppingItemId` を持つ Stock がある場合
  true／`sourceShoppingItemId` が null の Stock のみの場合は false／一致しない場合は false
- 防御性: `Pantry.stocks` の getter が防御的コピーを返す（取得配列への `push` が内部状態に
  影響しない）

**完了条件**

```bash
pnpm --filter @cookpit/domain test        # 全 green
pnpm --filter @cookpit/domain type-check  # 通過
pnpm lint
```

- `Quantity.subtract()`・`PantryId`・`StockId`・`Stock`・`Pantry`・`PantryRepository` が
  全て実装されている
- `packages/domain` 内の他ファイルへの依存が `node:crypto` と同パッケージ内の
  `ProductId`/`ShoppingItemId`/`Quantity` の型参照のみ（Drizzle・HTTP の型を持ち込んでいない）
- S-5（productId null 許容）・S-7（subtract 厳格 + consume クランプ）・S-3
  （`hasStockFromShoppingItem`）の各不変条件がテストで担保されている

**リスク**: `Stock`/`Pantry` の getter が防御的コピーを返し忘れると、Application 層で
Mapper が Domain の内部状態を書き換えてしまう事故につながる（ShoppingList の precedent どおり
全 getter に防御的コピーを徹底する）。

---

### Task 2: Infrastructure 層 — DB スキーマ・Repository の実装

**依存**: Task 1（`Pantry`/`Stock`/`PantryRepository` の型）

**対象ファイル**

| 種別 | ファイル                                                                     | 内容                                                       |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 追記 | `packages/infrastructure/src/db/schema.ts`                                   | `stocks` テーブル定義・型（S-2）                           |
| 追記 | `packages/infrastructure/src/testing/create-test-db.ts`                      | DDL 文字列に `stocks` 追記（IMP-2）                        |
| 新規 | `apps/web/src/db/migrations/0007_xxxxx.sql` + `meta/0007_snapshot.json`      | `drizzle-kit generate` 自動生成（IMP-1）                   |
| 追記 | `apps/web/src/db/migrations/meta/_journal.json`                              | 自動更新（新エントリ追記）                                 |
| 新規 | `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`      | `DrizzlePantryRepository`                                  |
| 新規 | `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts` | PGlite 統合テスト                                          |
| 追記 | `packages/infrastructure/src/index.ts`                                       | `export * from './repositories/drizzle-pantry.repository'` |

#### 2-1. `schema.ts` 追記（契約書 §2.3 / 設計書 §S-2 と同一。確定形）

```typescript
export const stocks = pgTable(
  'stocks',
  {
    id: text('id').primaryKey(),
    productId: text('product_id'), // null 許容・FK なし（集約またぎ。D-8/S-5）
    displayName: text('display_name').notNull(), // S-5
    amountValue: numeric('amount_value', { precision: 10, scale: 3 }).notNull(),
    amountUnit: text('amount_unit').notNull(),
    purchasedAt: timestamp('purchased_at').notNull(),
    expiresAt: date('expires_at'), // null 許容（S-4 案 α）
    storedLocation: text('stored_location'), // null 許容（S-4 案 α）。'fridge'|'freezer'|'pantry'
    sourceShoppingItemId: text('source_shopping_item_id').unique(),
    // ↑ UNIQUE = 「1 bought 品目 : 最大 1 Stock」不変条件（S-3 の二重追加防止の最終防衛線）
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('stocks_product_id_idx').on(table.productId)],
);

export type StockRow = typeof stocks.$inferSelect;
export type NewStockRow = typeof stocks.$inferInsert;
```

`date`/`index`/`numeric`/`pgTable`/`text`/`timestamp` は既存 import 文にすべて含まれているため
`schema.ts` 先頭の import 文の変更は不要（確認済み）。**`pantries` テーブルは作らない**
（S-1 常在モデル + S-2 単一テーブル案）。既存 7 テーブルの定義は一切変更しない。

#### 2-2. `create-test-db.ts` DDL 追記（IMP-2。必須）

`DDL` 定数の末尾（`shopping_items_shopping_list_id_idx` の後）に以下を追記する。カラム名・型・
制約を `schema.ts` と完全一致させる。

```sql
CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY,
  product_id text,
  display_name text NOT NULL,
  amount_value numeric(10, 3) NOT NULL,
  amount_unit text NOT NULL,
  purchased_at timestamp NOT NULL,
  expires_at date,
  stored_location text,
  source_shopping_item_id text UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocks_product_id_idx ON stocks (product_id);
```

#### 2-3. マイグレーション生成（IMP-1）

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: `apps/web/src/db/migrations/`（`apps/web/drizzle.config.ts` の `out` 設定）
- ファイル名は `0007_xxxxx.sql`（現状の最大連番 `0006_previous_jamie_braddock.sql` の次）
- 生成された `.sql` に `CREATE TABLE "stocks"` と `UNIQUE` 制約（`source_shopping_item_id`）・
  `CREATE INDEX`（`product_id`）が含まれること
- `meta/_journal.json` に新エントリが追記され、既存 `0000`〜`0006` のエントリは変更しないこと
- 既存 7 テーブルへの `ALTER` 文が含まれないこと
- 生成ファイルは手動編集せずそのままコミット対象とする

#### 2-4. `DrizzlePantryRepository`（新規）

単一テーブルのため JOIN は不要（`DrizzleShoppingListRepository`/`DrizzleProductRepository` より
単純）。**模範コード**: 両ファイルの child-table sync パターン（upsert + `notInArray` 削除）を
単一テーブルに適用する。

```typescript
import { notInArray } from 'drizzle-orm';
import { Pantry, Stock, type StorageLocation } from '@cookpit/domain/src/pantry/pantry';
import { PantryId } from '@cookpit/domain/src/pantry/pantry-id';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import type { DrizzleClient } from '../db/client';
import { stocks, type NewStockRow, type StockRow } from '../db/schema';
import { toUnit } from './mappers';

export class DrizzlePantryRepository implements PantryRepository {
  constructor(private readonly db: DrizzleClient) {}

  async find(): Promise<Pantry> {
    const rows = await this.db.select().from(stocks).orderBy(stocks.purchasedAt);
    return Pantry.reconstruct({
      id: PantryId.singleton(),
      stocks: rows.map((row) => this.toEntity(row)),
    });
  }

  async save(pantry: Pantry): Promise<void> {
    const stockRows = this.toStockRows(pantry);
    const currentIds = stockRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db.delete(stocks).where(notInArray(stocks.id, currentIds));
    } else {
      await this.db.delete(stocks);
    }

    for (const row of stockRows) {
      await this.db
        .insert(stocks)
        .values(row)
        .onConflictDoUpdate({
          target: stocks.id,
          set: { amountValue: row.amountValue },
        });
    }
  }

  private toEntity(row: StockRow): Stock {
    return Stock.reconstruct({
      id: StockId.fromString(row.id),
      productId: row.productId === null ? null : ProductId.fromString(row.productId),
      displayName: row.displayName,
      amount: Quantity.of(Number(row.amountValue), toUnit(row.amountUnit)),
      purchasedAt: row.purchasedAt,
      expiresAt: row.expiresAt === null ? null : toDate(row.expiresAt),
      storedLocation: row.storedLocation === null ? null : toStorageLocation(row.storedLocation),
      sourceShoppingItemId:
        row.sourceShoppingItemId === null
          ? null
          : ShoppingItemId.fromString(row.sourceShoppingItemId),
    });
  }

  private toStockRows(pantry: Pantry): NewStockRow[] {
    return pantry.stocks.map((stock) => ({
      id: stock.id.value,
      productId: stock.productId?.value ?? null,
      displayName: stock.displayName,
      amountValue: stock.amount.value.toString(),
      amountUnit: stock.amount.unit,
      purchasedAt: stock.purchasedAt,
      expiresAt: stock.expiresAt === null ? null : toDateString(stock.expiresAt),
      storedLocation: stock.storedLocation,
      sourceShoppingItemId: stock.sourceShoppingItemId?.value ?? null,
    }));
  }
}

function toDate(value: string): Date {
  return new Date(value + 'T00:00:00');
}

function toDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function toStorageLocation(value: string): StorageLocation {
  switch (value) {
    case 'fridge':
    case 'freezer':
    case 'pantry':
      return value;
    default:
      throw new Error(`Unknown stored location: ${value}`);
  }
}
```

**実装要点（正確に従うこと）**:

- `numeric` カラムの読み出しは `Number()` 変換を入れる（`amountValue`）
- `date` 型カラム（`expiresAt`）は必ず `'T00:00:00'` を付与してから `new Date()` する
  （`DrizzleShoppingListRepository.toDate` と同方式。JST 前日ずれ回避）
- `save()` は `stocks` テーブルに JOIN 相手がなく単一テーブルのため、`pantry.stocks`（=
  現在の望ましい全状態）に対して `notInArray` 削除 → 全行 upsert を行う。**親テーブルという
  概念がない**ため `DrizzleShoppingListRepository` の「親 upsert → 子 sync」の 2 段構成ではなく
  単段（`stocks` 自体が子であり親でもある）
- `save()` の upsert `set` 対象は `amountValue` のみ（`productId`/`displayName`/`purchasedAt`/
  `expiresAt`/`storedLocation`/`sourceShoppingItemId` は Stock 生成後に不変のフィールドのため
  対象外。`consumeStock` で変わるのは `amount` のみという Domain の不変条件と対応させる）
- `find()` は `ORDER BY purchased_at ASC`（FIFO 表示順。設計 §永続化パターン）

#### 2-5. `infrastructure/src/index.ts` 追記

```typescript
export * from './repositories/drizzle-pantry.repository';
```

#### 追加テスト（`drizzle-pantry.repository.test.ts`。PGlite 統合。`createTestDb()` 使用）

- 空 DB での `find()` → `stocks: []` の空 Pantry が復元される（null を返さないことの確認。S-1）
- `save()` → `find()`: 単一 Stock が正しく復元される（`productId`/`displayName`/`amount`/
  `purchasedAt`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` 一致）
- **nullability 全パターンの round-trip**: `productId`/`expiresAt`/`storedLocation`/
  `sourceShoppingItemId` それぞれ null と非 null の組み合わせ
- `source_shopping_item_id` の UNIQUE 制約違反（同一値を持つ 2 つの Stock を保存しようとすると
  エラーになる。S-3 最終防衛線）
- `save()` を同一 `id` で2回呼ぶと 1 行のまま `amount_value` のみ更新される
  （`productId`/`displayName` 等は変化しない）
- Stock を除いた `Pantry` を再 `save()` すると `stocks` から該当行が `DELETE` される
  （`notInArray` の 0 件分岐＝全 DELETE を含む）
- `amountValue` が `number` 型で復元される（文字列のまま返らない）
- `expiresAt` の往復でタイムゾーンのズレがない
- `find()` の復元順が `purchasedAt` 昇順であること（FIFO）

**完了条件**

```bash
pnpm --filter @cookpit/infrastructure test        # 全 green
pnpm --filter @cookpit/infrastructure type-check  # 通過
pnpm lint
```

- `schema.ts`/`create-test-db.ts` に既存 7 テーブル分の変更がないこと
- `PantryRepository` の 2 メソッド（`find`/`save`）が実装されていること
- `save()` が生成後に不変のフィールドを upsert の `set` に含めていないこと（`amountValue` のみ）
- マイグレーションが `apps/web/src/db/migrations/` に生成され、既存マイグレーションに変更が
  ないこと

**リスク**: `create-test-db.ts` への DDL 追記漏れ（IMP-2）は Task 2 の完了条件
（`pnpm --filter @cookpit/infrastructure test`）が全滅するため、この時点で確実に検知できる。

---

### Task 3: Application 層 — Pantry UseCase 3本 → CompleteShoppingUseCase

**依存**: Task 1（Domain の `Pantry`/`Stock`/`PantryRepository`）。実行時の DI 対象
（`ProductRepository`/`MealPlanRepository`/`ShoppingListRepository`/`PantryRepository`）は
既存インターフェースをそのまま使うため型検査は Task 1 のみで通るが、実際の Repository 実装
配線は Task 5（Presentation）で行う。

**対象ファイル**

| #   | 種別 | ファイル                                                                    | 内容                                                                                   |
| --- | ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | 新規 | `packages/application/src/pantry/pantry.dto.ts`                             | `StockDto`/`PantryDto`/`ConsumeStockInputDto`/`DiscardStockInputDto`/`StorageLocation` |
| 2   | 新規 | `packages/application/src/pantry/pantry.mapper.ts`                          | `toStockDto`/`toPantryDto`                                                             |
| 3   | 新規 | `packages/application/src/pantry/stock-not-found.error.ts`                  | `StockNotFoundError`                                                                   |
| 4   | 新規 | `packages/application/src/pantry/invalid-stock-operation.error.ts`          | `InvalidStockOperationError`                                                           |
| 5   | 新規 | `packages/application/src/pantry/consume-stock.use-case.ts`                 | `ConsumeStockUseCase`                                                                  |
| 6   | 新規 | `packages/application/src/pantry/discard-stock.use-case.ts`                 | `DiscardStockUseCase`                                                                  |
| 7   | 新規 | `packages/application/src/pantry/get-pantry.use-case.ts`                    | `GetPantryUseCase`                                                                     |
| 8   | 新規 | `packages/application/src/pantry/index.ts`                                  | バレルエクスポート                                                                     |
| 9   | 新規 | `packages/application/src/pantry/pantry-use-cases.test.ts`                  | Consume/Discard/Get の InMemory テスト                                                 |
| 10  | 追記 | `packages/application/src/shopping-list/shopping-list.dto.ts`               | `CompleteShoppingInputDto` 追加（IMP-4）                                               |
| 11  | 新規 | `packages/application/src/shopping-list/complete-shopping.use-case.ts`      | `CompleteShoppingUseCase`（D-1）                                                       |
| 12  | 追記 | `packages/application/src/shopping-list/index.ts`                           | `export * from './complete-shopping.use-case'`                                         |
| 13  | 新規 | `packages/application/src/shopping-list/complete-shopping.use-case.test.ts` | 独立テストファイル（IMP-5）                                                            |
| —   | 追記 | `packages/application/src/index.ts`                                         | `export * from './pantry'` を追加                                                      |

#### 3-1. Pantry DTO（`pantry.dto.ts`）

```typescript
import type { Unit } from '@cookpit/domain/src/shared/unit';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface StockDto {
  id: string;
  productId: string | null;
  displayName: string;
  amount: { value: number; unit: Unit };
  purchasedAt: string; // ISO 8601 datetime
  expiresAt: string | null; // "2026-07-11" 形式のローカル日付
  storedLocation: StorageLocation | null;
}

export interface PantryDto {
  stocks: StockDto[]; // purchasedAt 昇順。D-7: pantry id は含めない
}

export interface ConsumeStockInputDto {
  stockId: string;
  amount: { value: number; unit: Unit };
}

export interface DiscardStockInputDto {
  stockId: string;
}
```

`sourceShoppingItemId` は内部の冪等キーであり **DTO に含めない**（UI に用途がない。設計書
§Application 設計より）。

#### 3-2. Mapper（`pantry.mapper.ts`）

```typescript
import type { Pantry, Stock } from '@cookpit/domain/src/pantry/pantry';
import type { PantryDto, StockDto } from './pantry.dto';

export function toStockDto(stock: Stock): StockDto {
  return {
    id: stock.id.value,
    productId: stock.productId?.value ?? null,
    displayName: stock.displayName,
    amount: { value: stock.amount.value, unit: stock.amount.unit },
    purchasedAt: stock.purchasedAt.toISOString(),
    expiresAt: stock.expiresAt === null ? null : toLocalDateString(stock.expiresAt),
    storedLocation: stock.storedLocation,
  };
}

export function toPantryDto(pantry: Pantry): PantryDto {
  return { stocks: pantry.stocks.map(toStockDto) };
}

// UTC 変換による日付ずれを避け、ローカル日付のまま境界外へ渡す（shopping-list.mapper と同方式）。
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

#### 3-3. エラークラス2種（`meal-plan`/`shopping-list` 先例と同構造）

```typescript
// stock-not-found.error.ts
export class StockNotFoundError extends Error {
  constructor(stockId: string) {
    super(`Stock not found: ${stockId}`);
    this.name = 'StockNotFoundError';
  }
}
```

```typescript
// invalid-stock-operation.error.ts
export class InvalidStockOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockOperationError';
  }
}
```

#### 3-4. `ConsumeStockUseCase` / `DiscardStockUseCase` / `GetPantryUseCase`

設計 §データフロー「在庫消費」の擬似コードのとおり、入口チェック（存在 → 404、単位 → 422）を
UseCase 内で明示的に行い、Domain の汎用 `Error` には正常フローで到達させない。

```typescript
// consume-stock.use-case.ts
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { InvalidStockOperationError } from './invalid-stock-operation.error';
import { StockNotFoundError } from './stock-not-found.error';
import type { ConsumeStockInputDto, PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/**
 * 在庫を消費する。消費量が現在量以上の場合は Stock 側で全量消費にクランプする（S-7）。
 *
 * @throws StockNotFoundError stockId の Stock が存在しない
 * @throws InvalidStockOperationError amount.unit が対象 Stock の単位と一致しない
 */
export class ConsumeStockUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: ConsumeStockInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    const stockId = StockId.fromString(input.stockId);
    const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new StockNotFoundError(input.stockId);
    }
    if (input.amount.unit !== stock.amount.unit) {
      throw new InvalidStockOperationError(
        `Unit mismatch: expected ${stock.amount.unit}, got ${input.amount.unit}`,
      );
    }

    pantry.consumeStock(stockId, Quantity.of(input.amount.value, input.amount.unit));
    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
```

```typescript
// discard-stock.use-case.ts
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { StockNotFoundError } from './stock-not-found.error';
import type { DiscardStockInputDto, PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/**
 * 在庫を残量に関わらず全量廃棄する（部分廃棄はない。S-10: reason は受け取らない）。
 *
 * @throws StockNotFoundError stockId の Stock が存在しない
 */
export class DiscardStockUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: DiscardStockInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    const stockId = StockId.fromString(input.stockId);
    const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new StockNotFoundError(input.stockId);
    }

    pantry.discardStock(stockId);
    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
```

```typescript
// get-pantry.use-case.ts
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import type { PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/** 在庫 0 件でも常に成功する（S-1。「未作成」という状態が存在しない）。 */
export class GetPantryUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    return toPantryDto(pantry);
  }
}
```

#### 3-5. `pantry/index.ts`

```typescript
export * from './consume-stock.use-case';
export * from './discard-stock.use-case';
export * from './get-pantry.use-case';
export * from './invalid-stock-operation.error';
export * from './pantry.dto';
export * from './pantry.mapper';
export * from './stock-not-found.error';
```

#### 追加テスト（`pantry-use-cases.test.ts`。`InMemoryPantryRepository` を新設）

- `ConsumeStockUseCase`: 単位一致で消費が反映される／未検出 stockId で `StockNotFoundError`／
  単位不一致で `InvalidStockOperationError`（メッセージに expected/got 双方を含む）／全量消費で
  対象 Stock が `PantryDto.stocks` から消える（D-3 の更新後 DTO 返却を確認）
- `DiscardStockUseCase`: 対象が `PantryDto.stocks` から消える／未検出 stockId で
  `StockNotFoundError`／残量があっても全量削除される
- `GetPantryUseCase`: 空 Pantry で `{ stocks: [] }` を返す（例外を投げない）／複数 Stock がある
  場合に全件返す

#### 3-6. `CompleteShoppingInputDto`（`shopping-list.dto.ts` 追記。IMP-4）

```typescript
// packages/application/src/shopping-list/shopping-list.dto.ts に追記
export interface CompleteShoppingInputDto {
  shoppingListId: string;
}
```

#### 3-7. `CompleteShoppingUseCase`（`complete-shopping.use-case.ts`。D-1・本ユニットの核）

設計 §データフロー「買い物完了（中核フロー）」の擬似コード（ステップ 1〜8）をそのまま実装する。
**模範コード**: `generate-shopping-list.use-case.ts`（複数 Repository を手動 DI するコンストラクタ
形・private helper への分割スタイル）。

```typescript
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import type { CreateStockInput, Pantry } from '@cookpit/domain/src/pantry/pantry';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { PriceRecord } from '@cookpit/domain/src/product/product';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { UnitPriceCalculator } from '@cookpit/domain/src/product/unit-price-calculator';
import type { ShoppingItem } from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import type { CompleteShoppingInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 買い物完了を確定し、Pantry への在庫追加・Product への価格記録・MealPlan の
 * shopping→cooking 遷移までを一括して行う（4 集約またぎ・D-1）。
 *
 * 冪等: 既に completed の場合は Stock 追加・価格記録を再実行せず、MealPlan 遷移の
 * 修復のみ行って現状の ShoppingListDto を返す（S-3 案 B2）。保存順序は
 * Pantry → Product → ShoppingList → MealPlan（S-3 (2)）。ShoppingList の保存が
 * 「これより前は再実行対象・これより後は修復のみ」の境界（冪等ガードのコミットポイント）。
 * 価格記録のみ非冪等（重複記録があり得る。S-3 (4) 案 B・§リスク R-2）。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 */
export class CompleteShoppingUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly pantryRepository: PantryRepository,
    private readonly productRepository: ProductRepository,
    private readonly mealPlanRepository: MealPlanRepository,
  ) {}

  async execute(input: CompleteShoppingInputDto): Promise<ShoppingListDto> {
    const shoppingListId = ShoppingListId.fromString(input.shoppingListId);
    const shoppingList = await this.shoppingListRepository.findById(shoppingListId);
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }

    if (shoppingList.status === 'completed') {
      await this.repairMealPlanTransition(shoppingList.mealPlanId);
      return toShoppingListDto(shoppingList);
    }

    const boughtItems = shoppingList.items.filter((item) => item.isBought());
    const now = new Date();

    const pantry = await this.pantryRepository.find();
    this.addStocks(pantry, boughtItems, now);
    await this.pantryRepository.save(pantry);

    await this.recordPrices(boughtItems, now);

    shoppingList.complete();
    await this.shoppingListRepository.save(shoppingList);

    await this.repairMealPlanTransition(shoppingList.mealPlanId);

    return toShoppingListDto(shoppingList);
  }

  // S-3: 再実行時、同一 ShoppingItem 由来の Stock が既にあればスキップする（二重追加防止の第一段）
  private addStocks(pantry: Pantry, boughtItems: ShoppingItem[], now: Date): void {
    for (const item of boughtItems) {
      if (!pantry.hasStockFromShoppingItem(item.id)) {
        pantry.addStock(this.toAddStockInput(item, now));
      }
    }
  }

  // S-4 案 B + S-5 + S-6: ShoppingItem → Pantry.addStock 入力への変換をここに閉じ込める
  private toAddStockInput(item: ShoppingItem, now: Date): CreateStockInput {
    return {
      productId: item.productId,
      displayName: item.displayName,
      amount: item.requiredAmount ?? Quantity.of(1, '個'), // S-6
      purchasedAt: now,
      expiresAt: null, // S-4 案 α
      storedLocation: null, // S-4 案 α
      sourceShoppingItemId: item.id,
    };
  }

  // D-5: unique productId でグルーピングし、Product 1 件につき findById 1 回・save 1 回
  private async recordPrices(boughtItems: ShoppingItem[], now: Date): Promise<void> {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of boughtItems) {
      if (item.productId === null) {
        continue; // S-9 条件1: 記録先の Product がない
      }
      const key = item.productId.value;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    for (const [productIdValue, items] of groups) {
      const product = await this.productRepository.findById(ProductId.fromString(productIdValue));
      if (product === null) {
        continue; // S-9 条件5: 削除済み Product はスキップ（止めない）
      }
      for (const item of items) {
        const record = this.buildPriceRecord(item, now);
        if (record !== null) {
          product.recordPrice(record);
        }
      }
      await this.productRepository.save(product); // IMP-6: 常に 1 回 save
    }
  }

  // S-8/S-9: スキップ条件2〜4。条件1・5は recordPrices 側で判定済み
  private buildPriceRecord(item: ShoppingItem, now: Date): PriceRecord | null {
    const actualPrice = item.actualPrice;
    const actualStore = item.actualStore;
    if (actualPrice === null || actualStore === null) {
      return null; // bought 品目は本来非 null（markAsBought の不変条件）。型ガード
    }
    if (actualPrice.amount <= 0) {
      return null; // S-9 条件2（S-8: 無料品はスキップ）
    }
    if (item.requiredAmount === null || item.requiredAmount.value <= 0) {
      return null; // S-9 条件3: packageSize が導出できない
    }

    const packageSize = item.requiredAmount;
    const unitPrice = UnitPriceCalculator.calculate(actualPrice, packageSize);
    if (unitPrice.amount <= 0) {
      return null; // S-9 条件4: 丸めで 0 になった場合の防御的ガード
    }

    return PriceRecord.create({
      id: PriceRecordId.generate(),
      storeId: actualStore,
      price: actualPrice,
      unitPrice,
      packageSize,
      observedAt: now,
    });
  }

  // D-4: MealPlan 不存在ならスキップ・draft なら二段遷移で修復・shopping なら一段遷移
  private async repairMealPlanTransition(mealPlanId: MealPlanId): Promise<void> {
    const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
    if (mealPlan === null) {
      return; // 参照先の不存在でシステムを止めない（C-4 の精神）
    }
    if (mealPlan.status === 'draft') {
      mealPlan.transitionTo('shopping');
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
      return;
    }
    if (mealPlan.status === 'shopping') {
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
    }
    // cooking 以降は何もしない（修復済み・再実行ケース）
  }
}
```

**実装要点（正確に従うこと）**:

- `now`（`purchasedAt`/`observedAt` に使う単一のタイムスタンプ）は `execute()` の冒頭で 1 回だけ
  生成し、`addStocks`/`recordPrices` の両方に引き回す（設計 §データフローの擬似コードが両ステップ
  で同じ `now` を参照している点に対応）
- 保存順序は **Pantry → Product → ShoppingList → MealPlan** を厳守する（S-3 (2)）。順序を
  入れ替えると自己修復の前提が崩れる
- 冪等ガード（`status === 'completed'` 分岐）は `shoppingList.complete()` を呼ぶ**前**に
  行う。したがって `InvalidShoppingListStateError` へは（active 確認後にのみ `complete()` を
  呼ぶため）到達しない（設計書の確定記録どおり。onError の既存 422 分岐は変更不要）
- `recordPrices` は productId ごとに **findById 1 回・save 1 回**（IMP-6）。1 件も
  `recordPrice` されなかった場合も `save` 自体は実行する（空更新で無害）

#### 3-8. `shopping-list/index.ts` 追記

```typescript
export * from './complete-shopping.use-case';
```

#### 追加テスト（`complete-shopping.use-case.test.ts`。IMP-5。独立ファイル。

`InMemoryShoppingListRepository`/`InMemoryPantryRepository`/`InMemoryProductRepository`/
`InMemoryMealPlanRepository` をこのファイル内にローカル定義する）

- **冪等再実行**: 既に `completed` の ShoppingList に対して再実行すると、Pantry への
  `save` 呼び出し回数・Product への `save` 呼び出し回数が増えない（冪等パスで Stock 追加・
  価格記録が再実行されないことをスパイで確認）／戻り値の `ShoppingListDto` が変化しない
- **部分失敗の修復 (i)**: Stock だけ追加済み・ShoppingList はまだ `active` の状態から再実行
  すると、`hasStockFromShoppingItem` によりその品目の Stock が二重追加されない／後続の
  Product/ShoppingList/MealPlan 段は通常どおり実行される
- **部分失敗の修復 (ii)**: ShoppingList は既に `completed`・MealPlan が `shopping` のまま
  残っている状態から再実行すると、MealPlan が `cooking` へ遷移し `save` される
- **部分失敗の修復 (iii)**: MealPlan が `draft` のまま残っている状態（Generate の部分失敗が
  未修復のケース）から完了を実行すると、`draft → shopping → cooking` の二段遷移で修復される
- bought 品目が 0 件の完了: Pantry/Product への副作用なし・`complete()` と MealPlan 遷移のみ
  実行される
- **価格記録スキップ条件 5 種（S-9）**: `productId === null`／`actualPrice.amount === 0`
  （S-8）／`requiredAmount === null`／`requiredAmount.value === 0`／
  `UnitPriceCalculator.calculate` の結果が 0 に丸められる超安価 × 大容量ケース。各ケースで
  Stock 追加は行われるが `recordPrice` は呼ばれないことを確認
- `requiredAmount === null` 品目の Stock 化（S-6）: `Quantity.of(1, '個')` として
  `Pantry.addStock` に渡される
- 同一 Product に紐づく複数 bought 品目（D-5）: `productRepository.findById`/`save` が
  それぞれ 1 回だけ呼ばれる（呼び出し回数をスパイで確認）
- MealPlan 不存在（D-4）: `mealPlanRepository.findById` が null を返しても完了処理全体は
  例外を投げずに成功する
- `ShoppingListNotFoundError`: 存在しない shoppingListId で throw

**完了条件**

```bash
pnpm --filter @cookpit/application test        # 全 green
pnpm --filter @cookpit/application type-check  # 通過
pnpm lint
```

- Pantry 3 UseCase・`CompleteShoppingUseCase` が全て実装されている
- S-3 の冪等・3 種の部分失敗修復・S-9 のスキップ条件 5 種・D-4 の MealPlan 遷移分岐・D-5 の
  グルーピングがテストで担保されている
- `packages/application/src/index.ts` に `export * from './pantry'` が追加されている

**リスク**: 保存順序（Pantry→Product→ShoppingList→MealPlan）を誤ると自己修復の前提
（「ShoppingList 保存 = 冪等ガードのコミットポイント」）が崩れ、再実行時に Stock が
二重追加されうる（DB の UNIQUE 制約が最終防衛線として残るため致命的データ破損には
至らないが、500 エラーとしてクライアントに露出する）。Task 3 のテストで保存順序に依存する
3 つの部分失敗修復ケースを明示的にカバーすることで検知する。

---

### Task 4: API Contract 層 — Zod スキーマ

**依存**: Task 1（`Unit` 型の参照）・Task 3（`PantryDto`/`StockDto`/`CompleteShoppingInputDto`
の構造と整合させる）。契約書 `docs/designs/pantry-core-contract.md` §1〜§2 が確定形のため、
本タスクはその転記が中心。

**対象ファイル**

| 種別 | ファイル                                          | 内容                                                                                                           |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 新規 | `packages/api-contract/src/pantry.schema.ts`      | `stockIdParamSchema`/`consumeStockSchema`/`storageLocationSchema`/`stockResponseSchema`/`pantryResponseSchema` |
| 新規 | `packages/api-contract/src/pantry.schema.test.ts` | 契約テスト                                                                                                     |
| 追記 | `packages/api-contract/src/index.ts`              | `export * from './pantry.schema'`                                                                              |

#### 4-1. `pantry.schema.ts`（契約書 §1.1 の確定形をそのまま転記）

```typescript
import z from 'zod';
import { unitSchema } from './recipe.schema';

export const stockIdParamSchema = z.object({
  stockId: z.uuid(),
});

export const consumeStockSchema = z.object({
  amount: z.object({
    value: z.number().positive(), // D-6: 0 を reject
    unit: unitSchema,
  }),
});

export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry']); // D-2

export const stockResponseSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  displayName: z.string(),
  amount: z.object({ value: z.number(), unit: unitSchema }),
  purchasedAt: z.iso.datetime(),
  expiresAt: z.iso.date().nullable(),
  storedLocation: storageLocationSchema.nullable(),
});

export const pantryResponseSchema = z.object({
  stocks: z.array(stockResponseSchema), // D-7: pantry id は含めない
});

export type StockIdParam = z.infer<typeof stockIdParamSchema>;
export type ConsumeStockBody = z.infer<typeof consumeStockSchema>;
export type StorageLocationSchemaType = z.infer<typeof storageLocationSchema>;
export type StockResponse = z.infer<typeof stockResponseSchema>;
export type PantryResponse = z.infer<typeof pantryResponseSchema>;
```

**discard API・完了 API に新規リクエストスキーマは存在しない**（契約書 §1.1・§1.3）。
discard はボディなし POST（`zValidator('json', ...)` を付けない）。完了 API
（`POST /api/shopping-lists/:id/complete`）は param に既存 `shoppingListIdParamSchema`、
レスポンスに既存 `shoppingListResponseSchema` を再利用し、`shopping-list.schema.ts` 自体への
変更は不要（契約書 §1.1・§9）。

#### 4-2. `api-contract/src/index.ts` 追記

```typescript
export * from './pantry.schema';
```

#### 追加テスト（`pantry.schema.test.ts`。契約書 §7.1 の観点表をそのまま反映）

| 対象スキーマ            | 観点                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stockIdParamSchema`    | 正常 uuid を受け入れる／不正な `stockId` を reject する                                                                                                                                                                                                                                                 |
| `consumeStockSchema`    | `amount.value = 0` を reject する（D-6。`addItemSchema.requiredAmount.value: z.number().min(0)` との**意図的な非対称**を明示テストする）／負数を reject する／正数を受け入れる／`amount.unit` が 17 値それぞれを受け入れる（`it.each` 先例）／未知の単位を reject する／`amount` キー省略を reject する |
| `storageLocationSchema` | `'fridge'`/`'freezer'`/`'pantry'` を受け入れる／未知の文字列を reject する                                                                                                                                                                                                                              |
| `stockResponseSchema`   | `productId`/`expiresAt`/`storedLocation` すべて null を parse できる（S-1 空 Pantry 相当のパターン）／すべて非 null を parse できる／`purchasedAt` が ISO datetime 形式でない場合 reject／`expiresAt` が ISO date 形式でない場合 reject（datetime 文字列を date として reject することを含む）          |
| `pantryResponseSchema`  | `stocks: []` を parse できる（S-1）／複数 Stock を含む配列を parse できる                                                                                                                                                                                                                               |

**完了条件**

```bash
pnpm --filter @cookpit/api-contract test        # 全 green
pnpm --filter @cookpit/api-contract type-check  # 通過
```

- `pantry.schema.ts` の 5 スキーマが契約書 §1.1 と完全一致していること
- `shopping-list.schema.ts` に変更がないこと（既存 4 契約ファイル無変更）
- `consumeStockSchema.amount.value` の 0 reject（D-6）がテストされていること

---

### Task 5: Presentation 層 — Hono ルート + app.ts 統合

**依存**: Task 3（UseCase 群）・Task 4（Zod スキーマ）・Task 2（`DrizzlePantryRepository`）

**対象ファイル**

| 種別 | ファイル                                            | 内容                                                                                       |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 新規 | `apps/web/src/server/routes/pantry.ts`              | `pantryRoute`（GET `/`・POST `/stocks/:stockId/consume`・POST `/stocks/:stockId/discard`） |
| 新規 | `apps/web/src/server/routes/pantry.test.ts`         | ルートテスト                                                                               |
| 追記 | `apps/web/src/server/routes/shopping-lists.ts`      | `POST /:id/complete` 追加                                                                  |
| 追記 | `apps/web/src/server/routes/shopping-lists.test.ts` | complete エンドポイントのテスト追加                                                        |
| 追記 | `apps/web/src/server/app.ts`                        | `.route('/pantry', pantryRoute)` + onError 2 分岐追記                                      |

#### 5-1. `routes/pantry.ts`（新設。`shopping-lists.ts`/`products.ts` と同型パターン）

```typescript
import { getDb } from '@/db/client';
import { consumeStockSchema, stockIdParamSchema } from '@cookpit/api-contract';
import { ConsumeStockUseCase, DiscardStockUseCase, GetPantryUseCase } from '@cookpit/application';
import { DrizzlePantryRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

export const pantryRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetPantryUseCase(pantryRepository());
    const dto = await usecase.execute();
    return c.json(dto, 200);
  })
  .post(
    '/stocks/:stockId/consume',
    zValidator('param', stockIdParamSchema),
    zValidator('json', consumeStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new ConsumeStockUseCase(pantryRepository());
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  )
  .post('/stocks/:stockId/discard', zValidator('param', stockIdParamSchema), async (c) => {
    const { stockId } = c.req.valid('param');
    const usecase = new DiscardStockUseCase(pantryRepository());
    const dto = await usecase.execute({ stockId });
    return c.json(dto, 200);
  });
```

#### 5-2. `routes/shopping-lists.ts` 追記（complete エンドポイント）

既存の `mealPlanRepository()`/`productRepository()`/`shoppingListRepository()` ファクトリ関数は
再利用する。**新規追加が必要なのは `pantryRepository()` ファクトリと `CompleteShoppingUseCase`
の import、`.post('/:id/complete', ...)` チェーンのみ**（新規 Zod スキーマの import は不要。
既存 `shoppingListIdParamSchema` を再利用）。

```typescript
// import 追記
import { CompleteShoppingUseCase, /* 既存の他 UseCase */ } from '@cookpit/application';
import { DrizzlePantryRepository, /* 既存の他 Repository */ } from '@cookpit/infrastructure';

// 既存ファクトリ関数群の末尾に追加
function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

// .post(...) チェーンの末尾に追加（既存4エンドポイントの後）
  .post('/:id/complete', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new CompleteShoppingUseCase(
      shoppingListRepository(),
      pantryRepository(),
      productRepository(),
      mealPlanRepository(),
    );
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  });
```

#### 5-3. `app.ts` 統合

```typescript
// import 追記
import { pantryRoute } from './routes/pantry';
import {
  InvalidStockOperationError,
  StockNotFoundError,
  /* 既存の他エラークラス */
} from '@cookpit/application';

// .route() チェーンの末尾に追加
  .route('/pantry', pantryRoute);

// onError 内、ShoppingList 系分岐の直後に追加（契約書 §4.1 の推奨位置）
if (err instanceof StockNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof InvalidStockOperationError) {
  return c.json({ error: err.message }, 422);
}
```

既存の分岐順序（Recipe → Product → Store → MealPlan → PlannedRecipe →
InvalidMealPlanState → ShoppingList → ShoppingItem → InvalidShoppingListState →
`console.error`/500）への挿入は `instanceof` の個別分岐で相互排他なためどこでも機能的に
等価だが、可読性のため ShoppingList 系の直後に追記する。

#### 追加テスト

**`pantry.test.ts`（新規。`vi.mock('@cookpit/application', ...)` パターンは
`shopping-lists.test.ts` を踏襲）**:

- `GET /api/pantry`: 空でも 200 + `{ stocks: [] }` を返す（404 にならないことの確認。S-1）／
  複数 Stock がある場合に全件返す
- `POST /api/pantry/stocks/:stockId/consume`: 200 + `PantryDto` を返す／`amount.value: 0` で
  400（D-6）／不正な `stockId`（uuid でない）で 400／`StockNotFoundError` を 404 に変換／
  `InvalidStockOperationError` を 422 に変換
- `POST /api/pantry/stocks/:stockId/discard`: 200 + `PantryDto` を返す／不正な `stockId` で
  400／`StockNotFoundError` を 404 に変換

**`shopping-lists.test.ts` 追記**:

- `POST /api/shopping-lists/:id/complete`: 200 + `ShoppingListResponse` を返す／不正な `id`
  で 400／`ShoppingListNotFoundError` を 404 に変換／2 回連続呼び出しても両方 200 で
  レスポンス形が一致する（契約レベルの冪等確認。契約書 §7.4）

**完了条件**

```bash
pnpm --filter @cookpit/web test        # 全 green
pnpm --filter @cookpit/web type-check  # 通過
pnpm lint
```

- `app.ts` の既存 onError 分岐（9 分岐）の順序・挙動に変更がないこと（末尾に 2 分岐追加のみ）
- `pantryRoute` が `/api/pantry` にマウントされていること
- `GET /api/pantry` が常に 200 を返すこと（404 分岐が存在しないこと）の確認テストがあること

---

## 変更対象ファイル一覧（サマリ）

### 既存ファイルへの追記（13 ファイル）

| #   | ファイルパス                                                  | 変更内容                                            | タスク |
| --- | ------------------------------------------------------------- | --------------------------------------------------- | ------ |
| 1   | `packages/domain/src/shared/quantity.ts`                      | `subtract()` 追加                                   | Task 1 |
| 2   | `packages/domain/src/shared/quantity.test.ts`                 | `subtract()` テスト追加                             | Task 1 |
| 3   | `packages/infrastructure/src/db/schema.ts`                    | `stocks` テーブル追記                               | Task 2 |
| 4   | `packages/infrastructure/src/testing/create-test-db.ts`       | DDL 追記（IMP-2）                                   | Task 2 |
| 5   | `apps/web/src/db/migrations/meta/_journal.json`               | 自動更新                                            | Task 2 |
| 6   | `packages/infrastructure/src/index.ts`                        | `DrizzlePantryRepository` export 追記               | Task 2 |
| 7   | `packages/application/src/shopping-list/shopping-list.dto.ts` | `CompleteShoppingInputDto` 追加（IMP-4）            | Task 3 |
| 8   | `packages/application/src/shopping-list/index.ts`             | `export * from './complete-shopping.use-case'` 追記 | Task 3 |
| 9   | `packages/application/src/index.ts`                           | `export * from './pantry'` 追記                     | Task 3 |
| 10  | `packages/api-contract/src/index.ts`                          | `export * from './pantry.schema'` 追記              | Task 4 |
| 11  | `apps/web/src/server/routes/shopping-lists.ts`                | `POST /:id/complete` 追加                           | Task 5 |
| 12  | `apps/web/src/server/routes/shopping-lists.test.ts`           | complete テスト追加                                 | Task 5 |
| 13  | `apps/web/src/server/app.ts`                                  | マウント + onError 2 分岐追記                       | Task 5 |

### 新規作成ファイル

#### Domain（Task 1・7 ファイル）

`pantry-id.ts` / `stock-id.ts` / `pantry.ts` / `pantry.repository.ts` /
`pantry-id.test.ts` / `stock-id.test.ts` / `pantry.test.ts`

#### Infrastructure（Task 2・2 ファイル + マイグレーション自動生成）

`drizzle-pantry.repository.ts` / `drizzle-pantry.repository.test.ts` /
`apps/web/src/db/migrations/0007_xxxxx.sql` + `meta/0007_snapshot.json`（`drizzle-kit generate`
自動生成）

#### Application（Task 3・11 ファイル）

`pantry/pantry.dto.ts` / `pantry/pantry.mapper.ts` / `pantry/stock-not-found.error.ts` /
`pantry/invalid-stock-operation.error.ts` / `pantry/consume-stock.use-case.ts` /
`pantry/discard-stock.use-case.ts` / `pantry/get-pantry.use-case.ts` / `pantry/index.ts` /
`pantry/pantry-use-cases.test.ts` / `shopping-list/complete-shopping.use-case.ts` /
`shopping-list/complete-shopping.use-case.test.ts`

#### API Contract（Task 4・2 ファイル）

`pantry.schema.ts` / `pantry.schema.test.ts`

#### Presentation（Task 5・2 ファイル）

`routes/pantry.ts` / `routes/pantry.test.ts`

合計: 新規ファイル 24（うちテスト 8）+ マイグレーション自動生成分、既存ファイル追記 13。

---

## 依存関係と実装順

```
Task 1（Domain: Quantity.subtract + Pantry集約 + Repository IF）
  └─→ Task 2（Infrastructure: schema/DDL/migration/Repository実装）※ Task 1 の型に依存
        └─→ Task 3（Application: Pantry DTO/Mapper/Error/UseCase×3 → CompleteShoppingUseCase）
              ※ 型検査は Task 1 のみで通るが、実配線確認は Task 2 完了後が望ましい。
                Codex 実行順としては Task 2 → Task 3 を推奨
              ├─→ Task 4（API Contract: 独立に進行可。Task 3 の DTO 構造と整合させる）
              └─→ Task 5（Presentation）※ Task 3 の UseCase・Task 4 の Zod スキーマ・
                    Task 2 の DrizzlePantryRepository すべてに依存
```

- `CompleteShoppingUseCase`（Task 3 後半）は既存の `ShoppingListRepository`/`ProductRepository`/
  `MealPlanRepository`（Sprint 3/4 実装済み）と、Task 1〜2 で新設する `PantryRepository` の
  双方に依存する。Task 3 は「Pantry 3 UseCase（Consume/Discard/Get）→ CompleteShoppingUseCase」
  の順で実装する（設計書 §implementation-planner への申し送りどおり）
- Task 4（API Contract）は Task 3 と並行着手できるが、レスポンススキーマ
  （`stockResponseSchema`/`pantryResponseSchema`）は Task 3 の Mapper 出力構造と一致させる
  必要があるため、型往復の契約テストは Task 3 完了後に実施する
- shopping-list-core の先例どおり、**番号順に実行する**ことを Codex ブリーフに明記する

---

## 各タスクの完了条件（横断チェックリスト）

| Task             | 品質ゲート                                                           | 追加チェック                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Domain         | `pnpm --filter @cookpit/domain test/type-check`, `pnpm lint`         | S-5（productId null 許容）・S-7（subtract 厳格 + consume クランプ）・S-3（`hasStockFromShoppingItem`）がテストで担保、全 getter が防御的コピー |
| 2 Infrastructure | `pnpm --filter @cookpit/infrastructure test/type-check`, `pnpm lint` | 既存 7 テーブル無変更、マイグレーションが `apps/web/src/db/migrations/` に生成、`save()` が不変フィールドを set 対象外にする                   |
| 3 Application    | `pnpm --filter @cookpit/application test/type-check`, `pnpm lint`    | 冪等・3 種の部分失敗修復・S-9 スキップ条件 5 種・D-4 の MealPlan 遷移分岐・D-5 のグルーピングがテストで担保                                    |
| 4 API Contract   | `pnpm --filter @cookpit/api-contract test/type-check`                | `shopping-list.schema.ts` 無変更、D-6 の 0 reject がテストされている                                                                           |
| 5 Presentation   | `pnpm --filter @cookpit/web test/type-check`, `pnpm lint`            | 既存 onError 9 分岐無変更（末尾 2 分岐追加のみ）、`GET /api/pantry` の常時 200 確認テストあり                                                  |
| 全体             | `pnpm lint` / `pnpm type-check` / `pnpm test`（ルート）              | 既存テスト（Recipe/Product/Store/MealPlan/ShoppingList/health）に regression なし                                                              |

---

## テスト計画への参照

各タスクの「追加テスト」節は実装計画作成時点での最低限の観点であり、**詳細な試験ケース網羅
（正常系・異常系・境界条件の完全な一覧、ケース番号採番）は test-designer が
`docs/tests/pantry-core.md` として別途確定する**（並行作成中）。特に以下は設計 §テスト方針で
明示された設計由来の観点であり、test-designer の試験計画に必ず反映されるべき事項として申し送る。

- Domain（Pantry / Stock / Quantity）: `subtract` の単位不一致 throw・負値 throw・0 減算（S-7）、
  `Stock.consume` の全量クランプ（消費量 > 在庫量 → 0）と「消費量 = 在庫量」で isEmpty（境界）、
  consumeStock のゼロ到達 → 集約から削除、discardStock の残量無関係の全量削除、未検出 stockId
  の throw、`Stock.create` の `amount.value <= 0` 拒否、`hasStockFromShoppingItem` の真偽、
  `PantryId.singleton()` の同値性
- Application（CompleteShopping。最重要）: 冪等再実行（completed → 200・Stock/価格が再実行
  されない）、**部分失敗の修復**（(i) Stock 追加済み + active → 再実行で二重追加なし・後続段が
  実行される、(ii) completed + MealPlan=shopping → 遷移修復、(iii) MealPlan=draft → 二段遷移
  修復）、bought 0 件の完了、価格記録スキップ条件 5 種（S-9）、requiredAmount null 品目の
  「1 個」Stock 化（S-6）、同一 Product 複数品目の save 1 回（D-5 グルーピング）、MealPlan
  不存在スキップ（D-4）
- Application（Consume / Discard / Get）: 単位不一致 → InvalidStockOperationError、未検出 →
  StockNotFoundError、空 Pantry の GetPantry（`stocks: []` で 200 相当）
- Infrastructure（PGlite）: 空テーブルからの find（空 Pantry 復元）、round-trip（productId null
  / expiresAt null / storedLocation null / sourceShoppingItemId null の nullability 全パターン）、
  `source_shopping_item_id` UNIQUE 違反、NOT IN DELETE、expires_at のローカル日付整形
  （JST 前日ずれ）
- API 契約: 契約書 §7 の観点表（`consume` の `value: 0` reject（D-6）を含む）
- テストランナーは Vitest。完了条件は `pnpm lint` / `pnpm type-check` / `pnpm test`

---

## リスクと緩和

設計 §リスク（R-1〜R-7）に加え、本実装計画で識別した実装レベルのリスクを併記する。

| #       | リスク                                                                                                                          | 影響                                                                                                        | 緩和                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 設計R-1 | S-x 未確定のまま実装着手（対応済み）                                                                                            | 手戻り                                                                                                      | 2026-07-14 に S-1〜S-11 全件ユーザー確定済み。本計画はそれを前提に作成                                                                                                                    |
| 設計R-2 | 価格記録の非冪等性（S-3 (4) 案 B）                                                                                              | 完了処理の再実行のたびに価格が重複記録され得る                                                              | 既知の MVP1 制約として受容（§リスク R-2 参照）。完全収束が必要なら S-3 案 A（`price_records` への UNIQUE 追加）が代替だが本ユニットでは非採用。手動削除以外の回復手段がないことを申し送る |
| 設計R-3 | 4 集約更新が非トランザクション                                                                                                  | 部分失敗の窓自体は残る                                                                                      | S-3 の保存順序（Pantry→Product→ShoppingList→MealPlan）+ UNIQUE + 冪等再実行で収束。トランザクション導入は横断課題として申し送り継続（ADR-0006 R-3 と同一）                                |
| 設計R-4 | Pantry 集約全体 save による同時更新の失われた更新                                                                               | A が消した Stock を、古い集約を持つ B の save が復活させ得る                                                | 既存 MealPlan/ShoppingList save と同一の既知制約。2 名利用の同時操作頻度では許容し、Unit B 実測後に部分 UPDATE 化を検討（対応不要）                                                       |
| 設計R-5 | S-9 の packageSize 転用による unitPrice の精度の粗さ                                                                            | 価格履歴の統計精度が下がる                                                                                  | 既知の MVP1 制約として受容。正確な記録は既存の手動 RecordPrice が併存する                                                                                                                 |
| 設計R-6 | `docs/04-domain-model.md` との乖離放置                                                                                          | 後続実装（Unit B/C）が古い擬似コードを参照する                                                              | 本計画の §ドキュメント更新対象で同期タスクを明記（下記）                                                                                                                                  |
| 設計R-7 | S-11（`findByProduct` 等の先送り）により Unit C 着手時に Pantry へのメソッド追加が必要                                          | Unit C の着手コスト                                                                                         | 後方互換的な追加で済む構造（`stocks_product_id_idx` 先行配置・FIFO 順序仕様・subtract 意味論を申し送り済み）                                                                              |
| IMP-R1  | IMP-2（PGlite DDL 追記）漏れ                                                                                                    | Infrastructure テストが DB エラーで全滅                                                                     | Task 2 の完了条件に明記。テスト実行で即座に検知できる                                                                                                                                     |
| IMP-R2  | 保存順序（Pantry→Product→ShoppingList→MealPlan）の実装ミス                                                                      | 自己修復の前提が崩れ、再実行時に Stock が二重追加されうる（UNIQUE で最終防御はされるが 500 露出）           | Task 3 のコード例に順序を明記。3 種の部分失敗修復ケースをテストで明示的にカバー                                                                                                           |
| IMP-R3  | `CompleteShoppingInputDto` の配置誤り（`pantry.dto.ts` に書いてしまう等）                                                       | Task 5 での import が破綻し type-check が失敗する                                                           | IMP-4 として配置先を明記。type-check（Task 3 完了条件）で即座に検知できる                                                                                                                 |
| IMP-R4  | 価格記録スキップ条件の判定順序ミス（`requiredAmount<=0` チェックを `UnitPriceCalculator.calculate` 呼び出しより後にしてしまう） | `UnitPriceCalculator.calculate`/`PriceRecord.create` の正数チェックで例外が投げられ、完了処理全体が失敗する | Task 3 のコード例で判定順序（条件2→3→4）を明記。テストでスキップ条件 5 種を個別にカバー                                                                                                   |
| IMP-R5  | `Stock.consume` のクランプと `Quantity.subtract` の厳格 throw の取り違え                                                        | 過剰消費（S-7 の正常系）で誤って例外が投げられる                                                            | Task 1 のコード例・テストで「消費量 = 在庫量」「消費量 > 在庫量」の境界を明示的にカバー                                                                                                   |

---

## ロールバック方針

新規テーブル追加のみで既存テーブルへの変更はない（設計 §移行とリリース）。層ごとに独立して
ロールバック可能だが、Infrastructure と Application はテーブル・型の整合が必要なため、原則
Task の逆順（5→4→3→2→1）で戻す。

1. **Presentation（Task 5）**: `routes/pantry.ts`（+テスト）を削除し、`routes/shopping-lists.ts`
   から `POST /:id/complete` ハンドラと `pantryRepository()` ファクトリを削除、
   `shopping-lists.test.ts` の complete テストを削除、`app.ts` の 3 箇所の変更（import・
   `.route()`・onError 2 分岐）を元に戻す
2. **API Contract（Task 4）**: `pantry.schema.ts`（+テスト）を削除し、`index.ts` の追記行を
   削除する
3. **Application（Task 3）**: `packages/application/src/pantry/` ディレクトリを削除し、
   `packages/application/src/shopping-list/complete-shopping.use-case.ts`（+テスト）を削除、
   `shopping-list.dto.ts` から `CompleteShoppingInputDto` を削除、`shopping-list/index.ts` の
   追記行を削除、`application/src/index.ts` の `export * from './pantry'` を削除する
4. **Infrastructure（Task 2）**:
   - `schema.ts` から `stocks` 定義を削除する
   - `create-test-db.ts` の DDL から該当 `CREATE TABLE`/`CREATE INDEX` を削除する
   - 生成されたマイグレーションファイル（`apps/web/src/db/migrations/0007_xxxxx.sql` と対応する
     `meta/0007_snapshot.json`）を削除し、`meta/_journal.json` から該当エントリを削除する
   - 本番 DB に適用済みの場合は `DROP TABLE stocks;`（他テーブルからの被参照 FK がないため
     単純に DROP できる。`shopping_items`→`shopping_lists` のような順序制約はない）
   - `drizzle-pantry.repository.ts`（+テスト）を削除し、`infrastructure/src/index.ts` の
     export 行を削除する
5. **Domain（Task 1）**: `packages/domain/src/pantry/` ディレクトリを削除し、
   `packages/domain/src/shared/quantity.ts` から `subtract()` を削除する（`quantity.test.ts`
   の該当テストも削除）。他ファイルへの影響はない（`ProductId`/`ShoppingItemId` を型参照する
   のみでそれらのファイル自体は変更していない）

各層は疎結合（Domain 変更なしで Infrastructure だけロールバック可能、等）だが、既存の
`Recipe`/`Product`/`Store`/`MealPlan`/`ShoppingList` 縦スライスは一切変更していないため、
本ユニットの完全撤去は既存機能に影響しない。

---

## ドキュメント更新対象

L2/L3 のドキュメント方針（`docs/claude-code/document-policy.md`）に基づき、実装完了後に必要な
ドキュメント更新を明記する。**本計画では作成しない（実際の編集は実装完了後のフォローアップで
メインエージェント/Orchestrator が行う）。**

| #   | 対象ドキュメント                                                  | 更新内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 誰が・いつ                                                         |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `docs/04-domain-model.md` §Pantry 集約                            | 設計書 R-6 のとおり同期する: (a) Domain メソッド `getBoughtItemsForPantry()` を「作らない（S-4 案 B。Application 層で filter + 変換）」に修正、(b) `Stock.expiresAt`/`Stock.storedLocation` を null 許容（S-4 案 α）に修正、(c) `Stock.productId` を `ProductId \| null` + `displayName` 保持（S-5）に修正、(d) `requiredAmount = null` 品目は `Quantity.of(1, '個')`（S-6）と明記、(e) `Quantity.subtract` の厳格仕様 + `Stock.consume` のクランプ責務分離（S-7）を反映、(f) 消費/廃棄の `reason` を削除（S-10）、(g) `calculateRequiredAmount`/`findByProduct`/`findExpiringSoon` は本ユニット非実装（S-11）である旨の注記、(h) `CompleteShoppingUseCase` 擬似コードを実装同期形（4 段保存順序・冪等ガード）に更新 | 実装完了後、メインエージェント（reviewer 工程）が対応              |
| 2   | `docs/decisions/ADR-0007-complete-shopping-idempotent.md`（新規） | 設計書 §ADR 候補 1 のとおり起票する。**内容**: 買い物完了の冪等性（B2・completed なら Stock/価格記録を再実行せず MealPlan 遷移のみ修復）、4 段保存順序（Pantry→Product→ShoppingList→MealPlan）による部分失敗の自己修復、`stocks.source_shopping_item_id` UNIQUE による Stock 二重追加防止の最終防衛線、価格記録のみ非冪等性を許容する判断（完了状態は収束するが価格履歴は成功 1 回分と一致しない可能性を受容。§リスク R-2）。ADR-0006（Generate の冪等）と対をなす恒久判断として、同 ADR と同一の章構成（Context/Decision/Alternatives/Consequences/Migration/Rollback）で作成する                                                                                                                                   | 実装完了後、メインエージェント（reviewer/Orchestrator 工程）が対応 |
| 3   | `docs/05-roadmap.md`                                              | Sprint 5 タスク表の Unit A（pantry-core）行を「未着手」→「完了」に更新（実装完了・PR マージ後）。**Unit C（在庫引き算連携）の前提注記を追加**: `findByProduct`/`calculateRequiredAmount` は Unit C 側で `Pantry` に後方互換的に追加すること（S-11 の申し送り。`stocks_product_id_idx` は先行配置済み・`subtract` は負値 throw のため `calculateRequiredAmount` は引き算前に大小比較して 0 を返す実装にする旨も含める）                                                                                                                                                                                                                                                                                               | 実装完了後、メインエージェントが対応                               |
| 4   | `docs/designs/shopping-list-core.md`（任意）                      | 将来課題の消込: `getBoughtItemsForPantry()`/`BoughtItemForPantry` は S-4（本ユニット確定）により「Domain メソッドとしては作らない」で決着した旨を追記する（対応は任意。必須ではない）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 実装完了後、任意対応                                               |

---

## 品質ゲート

全 Task 完了後、ルートで以下を実行しすべて green であること（`.claude/rules/coding-standards.md`
「品質ゲート」節）。

```bash
pnpm lint
pnpm type-check
pnpm test
```

- 新規追加した Vitest ファイル（Domain 3・Infrastructure 1・Application 3・API Contract 1・
  Presentation 1 = 計 9 ファイル）が全て green
- 既存テスト（Recipe/Product/Store/MealPlan/ShoppingList/health 関連）に regression がないこと
- スコープ外変更がないこと（既存 Recipe/Product/Store/MealPlan/ShoppingList の Domain・
  Repository・ルートは、本計画で明記した追記箇所（複数 UseCase の import 追加・complete
  エンドポイント追加）以外は一切変更しない）
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・
  `import type` 漏れ・バリデーションエラーメッセージ分岐・無限ループ等。
  `feedback_codex_review.md` Memory も参照）をセルフチェック済みであること
- 設計書 S-3 の保存順序（Pantry→Product→ShoppingList→MealPlan）が `CompleteShoppingUseCase`
  実装に厳密に反映されていること（IMP-R2 の重点確認）

---

## Orchestrator への確認事項

- 設計判断（S-1〜S-11・D-1〜D-8・契約書 §1〜§9）からの逸脱は本計画には**ない**。実装計画作成
  過程で洗い出した差異（IMP-1〜IMP-8）はいずれも機械的な整合・設計書が明示的に
  implementation-planner へ委ねた判断（マイグレーション連番・DDL 同期・JSDoc 適用・DTO 配置・
  テストファイル分割・save タイミング・ファイル構成）であり、設計判断の変更ではないと判断した
- 軽微な観察事項（対応不要・参考情報）: `docs/designs/pantry-core-contract.md` 冒頭のステータス
  表記が「draft（S-x がユーザー確定するまで本書も draft）」のままだが、S-x は 2026-07-14 に
  全件確定済みであり、契約書 §1〜§9 の内容自体は確定後の推奨案とそのまま一致している（内容面の
  矛盾はない）。ステータス表記の更新のみが取り残されているため、実装完了後のドキュメント更新
  フォローアップ（§ドキュメント更新対象）と合わせて「confirmed」表記への更新を検討されたい
