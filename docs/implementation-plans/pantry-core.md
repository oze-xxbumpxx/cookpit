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
