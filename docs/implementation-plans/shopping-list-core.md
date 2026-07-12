# 実装計画: shopping-list-core

- ステータス: ready
- 設計書: `docs/designs/shopping-list-core.md`（確定。S-1〜S-11 は 2026-07-12 ユーザー確定。末尾
  §契約確定仕様 は contract-designer 確定・2026-07-12）
- 要件定義: `docs/requirements/shopping-list-core.md`
- 実装ルート: **Codex 委譲**（`docs/06-ai-tools.md` §実装ルートの使い分け /
  `docs/claude-code/orchestration-policy.md` §実装ルートの分岐）。**implementer は起動しない。**
  `create-codex-brief` 以降（`docs/tasks/codex/shopping-list-core/` への指示書分割・生成・Codex 実行・
  レビュー）はメインエージェント側で実施する。本計画は「Codex への実装指示書に落とし込める粒度」で
  各作業単位を自己完結的に記述する（先例: `docs/tasks/codex/meal-plan-core/`）。

---

## 概要

`ShoppingList`（+ 集約内エンティティ `ShoppingItem`）を Domain / Infrastructure / Application /
API Contract / Presentation(API) の全層に縦断して新規実装する。既存の `MealPlan`/`Product`/`Recipe`
縦スライスの実装パターンを完全踏襲する。画面(UI)は対象外（Unit B `shopping-list-screens`）。
`CompleteShoppingUseCase`・Pantry 連携の実装は対象外（Sprint 5。`complete()` は Domain 実装のみ
先行、S-8）。

実装順序は **Domain（Quantity.add + ShoppingList 集約 + Repository IF）→ Infrastructure（schema →
migration → repository）→ Application（DTO/mapper/error/UseCase 5本）→ API-Contract（Zod）→
Presentation（route → app.ts）→ 各層テスト → 品質ゲート**。Sprint 3 Unit A（meal-plan-core）の
5 分割（`docs/tasks/codex/meal-plan-core/01-domain.md`〜`05-presentation.md`）と同一の層別分割を
踏襲し、Codex タスクも 5 本に分割する。

---

## 前提（確定済み。実装中に変更しない）

設計書冒頭の確定記録どおり、S-1〜S-11 は全件ユーザー確定済み。以下は実装で必ず踏襲する確定値の
要約（詳細根拠は設計書 §設計判断リストを参照）。

| ID                | 確定内容                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1               | `shopping_items` は別テーブル（JSONB 不採用）                                                                                                                                                                                                                       |
| S-2               | Pantry 依存なし（`GenerateShoppingListUseCase` は `PantryRepository` を注入しない）                                                                                                                                                                                 |
| S-3               | Product 名寄せは `productRef` 引き継ぎのみ（ランタイム alias マッチングなし）                                                                                                                                                                                       |
| S-4               | 材料集計は同一キー・同一単位のみ `Quantity.add()` で合算。共有 VO への純追加                                                                                                                                                                                        |
| S-5               | `ShoppingItem.requiredAmount: Quantity \| null` + `amountNote: string \| null`（排他）                                                                                                                                                                              |
| S-6               | `GenerateShoppingListUseCase` が MealPlan の `draft→shopping` 遷移を担い、冪等（既存 active を返す）。`shopping_lists.meal_plan_id` UNIQUE。部分失敗は再実行時に自己修復                                                                                            |
| S-7               | `GetShoppingListUseCase` + `GET /api/shopping-lists/:id` を Unit A に追加                                                                                                                                                                                           |
| S-8               | `ShoppingList.complete()` は Domain 実装（API 非公開）。`getBoughtItemsForPantry()` は実装しない                                                                                                                                                                    |
| S-9               | `ShoppingItem.markAsSkipped()` は Domain 実装（UseCase/API は作らない）                                                                                                                                                                                             |
| S-10              | `shoppingDate = mealPlan.weekOf.startDate()`（週開始土曜固定）                                                                                                                                                                                                      |
| S-11              | markAsBought は現状態を問わず上書き許容。reassignStore は bought でも targetStore のみ変更可。チェック解除（bought→pending）は Unit A では作らない                                                                                                                  |
| D-1〜D-8          | 設計者裁量・確定済み（targetStore null 許容 / active ガード全操作共通 / storeId 実在チェックなし / findByIds 新設せず findById ループ / 変更系戻り値は更新後 Dto / enum は text カラム・FK は集約内親子のみ / 空 plannedRecipes 許容 / 削除済み Recipe はスキップ） |
| §契約確定仕様 §8  | `errorResponseSchema` は `meal-plan.schema.ts` から import して再利用（再定義しない）                                                                                                                                                                               |
| §契約確定仕様 §10 | Generate は新規 201 / 冪等（既存 active リスト返却）200                                                                                                                                                                                                             |

---

## 実装計画作成時に判明した設計書との差異・補足（要 Codex ブリーフ反映）

設計書に明記されていないが、実リポジトリ構成の確認により実装に必須と判明した事項、および
「Codex への指示書に落とし込む」ために技術的に決める必要があった配線の詳細。meal-plan-core の
G-1〜G-3 と同じ性質（設計判断の変更ではなく機械的な整合）のため、Orchestrator への差し戻しは
不要と判断した。

| #     | 差異・補足                        | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 対応                                                                           |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| IMP-1 | マイグレーション出力先            | `apps/web/drizzle.config.ts` の `out: './src/db/migrations'` により出力先は **`apps/web/src/db/migrations/`**（`packages/infrastructure/src/db/migrations/` ではない。meal-plan-core G-1 と同一事情）。現在の最大連番は `0005_faulty_xorn.sql` のため、本ユニットでの生成物は `0006_xxxxx.sql`（ファイル名の adjective-noun 部分は `drizzle-kit generate` が自動採番するため執筆時点では確定しない）                                                                                                                                                                                                                                                | Task 2（Infrastructure）で対応                                                 |
| IMP-2 | PGlite テスト DDL                 | `packages/infrastructure/src/testing/create-test-db.ts` は migrations を使わず `schema.ts` と手動同期した DDL 文字列を PGlite に直接適用している。`shopping_lists`/`shopping_items` の `CREATE TABLE` をこの DDL に追記しないと `drizzle-shopping-list.repository.test.ts` が全滅する（meal-plan-core G-2 と同一事情）                                                                                                                                                                                                                                                                                                                              | Task 2 で対応                                                                  |
| IMP-3 | `requiredAmount.unit` の DTO 型   | 設計 §Application 設計のコード例では `ShoppingItemDto.requiredAmount.unit: string` / `AddItemInputDto.requiredAmount.unit: string` だが、実装は既存 `product.dto.ts`（`PriceRecordDto.packageSizeUnit: Unit`、`CreateProductInputDto.defaultUnit: Unit` 等）の precedent に倣い **`Unit`**（`@cookpit/domain/src/shared/unit` の `import type`）に統一する。値集合は api-contract の `unitSchema`（`recipe.schema.ts` の 17 値 enum）と完全一致するため契約・レスポンス双方に影響しない。`Quantity.of(value, unit)` へ渡す際の unsafe cast や独自 `toUnit` 複製が不要になる実装上の理由による型統一であり、S-x/D-x の確定判断を変更するものではない | Task 3 で適用。§契約確定仕様の Zod 定義（`unitSchema` 再利用）自体は変更しない |
| IMP-4 | Generate の 201/200 分岐の戻り値  | §契約確定仕様 §10 で確定した「新規 201・冪等 200」をルート層で実装するための情報が必要。設計 §Application 設計のコード例は `GenerateShoppingListUseCase.execute(): Promise<ShoppingListDto>` だが、実装は **`Promise<GenerateShoppingListResultDto>`**（`{ shoppingList: ShoppingListDto; created: boolean }`）とする。レスポンスボディ自体（`shoppingList` の中身）は設計どおりで、戻り値のラップのみの変更。Hono ルートで `c.json(result.shoppingList, result.created ? 201 : 200)` と呼び分ける                                                                                                                                                  | Task 3・Task 5 で対応                                                          |
| IMP-5 | `ProductId` の名前衝突            | `RecipeIngredient.productRef` の型は `recipe-ingredient.ts` ローカルで `export interface ProductId { readonly value: string }` として定義されており、`product/product-id.ts` の `ProductId` クラスと**同名**（設計 §現状構成で既に指摘済み）。`GenerateShoppingListUseCase` で両方を扱う箇所では `product/product-id.ts` の `ProductId` のみを名前付きインポートし、`recipe-ingredient.ts` 側の型は明示インポートしない（`ingredient.productRef?.value` でアクセスすれば型推論で足り、名前衝突は発生しない）                                                                                                                                        | Task 3（Generate 実装時に厳守）                                                |
| IMP-6 | `packages/api-contract` の Vitest | meal-plan-core 実装時（G-3）に `package.json`/`vitest.config.ts` を導入済み（`packages/api-contract/vitest.config.ts` 現存確認済み）。本ユニットでは追加設定不要                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 対応不要（確認のみ）                                                           |
| IMP-7 | `ShoppingItemId` のテストファイル | 設計 §変更後構成の新規ファイル一覧には `shopping-item-id.test.ts` が明記されていないが、`product-id.test.ts`/`price-record-id.test.ts`（同一パッケージ内 2 ID VO をそれぞれ個別にテストする既存 precedent）に倣い追加する                                                                                                                                                                                                                                                                                                                                                                                                                           | Task 1 で対応                                                                  |

---

## Codex タスク分割（5 タスク・番号順に実行）

`docs/tasks/codex/meal-plan-core/` と同じ形式（層単位・1 指示書=1PR 相当）で分割する。
各タスクは自己完結（前タスクの成果物への依存のみで、後続タスクの内容を先取りしない）。

| #   | 対象層             | 概要                                                                                                                                              |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Domain             | `Quantity.add()` / `ShoppingListId` / `ShoppingItemId` / `ShoppingList` 集約 + `ShoppingItem` エンティティ / `ShoppingListRepository` IF + テスト |
| 2   | Infrastructure     | DB スキーマ追記 / PGlite DDL 追記 / マイグレーション生成 / `DrizzleShoppingListRepository` 実装 + テスト                                          |
| 3   | Application        | DTO / Mapper / エラー3種 / UseCase 5本（Generate/AddItem/MarkAsBought/ReassignStore/GetShoppingList）+ テスト                                     |
| 4   | API Contract       | `shopping-list.schema.ts`（Zod）+ 契約テスト                                                                                                      |
| 5   | Presentation (API) | Hono ルート5本 / `app.ts` 統合（マウント + onError 3分岐追記）                                                                                    |

---

### Task 1: Domain 層 — Quantity.add() + ShoppingList 集約

**依存**: なし（既存 `packages/domain` のみに依存。他パッケージへの依存なし）

**対象ファイル**

| 種別 | ファイル                                                        | 内容                                                      |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------- |
| 追記 | `packages/domain/src/shared/quantity.ts`                        | `add(other: Quantity): Quantity` を追加（S-4）            |
| 追記 | `packages/domain/src/shared/quantity.test.ts`                   | `add()` のテストケース追加                                |
| 新規 | `packages/domain/src/shopping-list/shopping-list-id.ts`         | `ShoppingListId`（`ProductId` パターン踏襲）              |
| 新規 | `packages/domain/src/shopping-list/shopping-item-id.ts`         | `ShoppingItemId`（同上）                                  |
| 新規 | `packages/domain/src/shopping-list/shopping-list.ts`            | `ShoppingList` 集約 + `ShoppingItem` エンティティ + 型3種 |
| 新規 | `packages/domain/src/shopping-list/shopping-list.repository.ts` | `ShoppingListRepository` IF                               |
| 新規 | `packages/domain/src/shopping-list/shopping-list-id.test.ts`    | `ShoppingListId` 単体テスト                               |
| 新規 | `packages/domain/src/shopping-list/shopping-item-id.test.ts`    | `ShoppingItemId` 単体テスト（IMP-7）                      |
| 新規 | `packages/domain/src/shopping-list/shopping-list.test.ts`       | `ShoppingList`/`ShoppingItem` 集約テスト                  |

#### 1-1. `Quantity.add()`（設計 §Domain 設計「Quantity.add()」節をそのまま実装）

```typescript
// packages/domain/src/shared/quantity.ts に追記
add(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot add different units');
  }
  return Quantity.of(this.quantityValue + other.quantityValue, this.quantityUnit);
}
```

`Money.add()` と同文型。既存呼び出し箇所（Recipe/Product/MealPlan は `of`/`multiply` のみ使用）への
影響はない純追加。

**追加テスト（`quantity.test.ts`）**: 同一単位の加算（`100g + 200g = 300g`）／異なる単位で
`'Cannot add different units'` を throw／`0 + x = x`。

#### 1-2. `ShoppingListId` / `ShoppingItemId`

`packages/domain/src/product/product-id.ts` を一字一句パターン踏襲する（`private constructor` /
`static generate()`（`node:crypto` の `randomUUID`）/ `static fromString()` / `equals()` /
`get value()`）。プロパティ名は `shoppingListIdValue` / `shoppingItemIdValue`。

#### 1-3. `ShoppingList` 集約 + `ShoppingItem` エンティティ（`shopping-list.ts`）

設計 §バックエンド設計 §Domain 設計を実コードに落とす。**模範コード**: `packages/domain/src/meal-plan/meal-plan.ts`
（`canChangeRecipes`/`findPlannedRecipe` の private helper 構造）と
`packages/domain/src/recipe/recipe-ingredient.ts`（`amount`/`amountNote` 排他検証ロジック）。

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

  // S-9: 設計の規定どおり pending → skipped のみ許可（統合レビュー時確定・SI-TR-07）。
  // bought→skipped を許すと actualPrice/actualStore が残る不整合状態になるため不可。
  // 「やっぱり買わない」の訂正（bought→pending 解除）は Unit B で要否判断（S-11d）
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

**注意（コーディング規約遵守）**: `mealPlanId: MealPlanId` は `import type { MealPlanId } from '../meal-plan/meal-plan-id'`
（型のみ・集約またぎの ID 参照。`PlannedRecipe` が `RecipeId` を `import type` で参照する先例と同じ）。
`ProductId`/`StoreId`/`Money`/`Quantity` も本ファイル内では型としてのみ使用するため `import type` で統一する
（ランタイムでの `ProductId.fromString()` 等の呼び出しは Application 層が担う）。

Domain 内の throw は MealPlan 先例（単純 `Error` + メッセージ）に合わせる。Application 層で
エラークラスに変換する（Task 3）。

#### 1-4. `ShoppingListRepository`（`shopping-list.repository.ts`）

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

`delete` は Sprint 4 スコープ外のため定義しない（設計 §Domain 設計で明記）。

#### 追加テスト（`shopping-list.test.ts`）

- `ShoppingItem.create()`: displayName 空白で throw／`requiredAmount`/`amountNote` 両方 null で
  throw／両方非 null で throw／`requiredAmount` のみ・`amountNote` のみでそれぞれ成功／初期値
  `status='pending'`・`actualPrice=null`・`actualStore=null`
- `ShoppingItem.markAsBought()`: pending→bought／既に bought の item への再適用で上書き（S-11a）／
  skipped の item への適用（S-11b、skipped→bought）
- `ShoppingItem.reassignStore()`: `targetStore` のみ変更、`status='bought'` の item に適用しても
  `actualPrice`/`actualStore` は変わらない（S-11c）
- `ShoppingItem.markAsSkipped()`: pending→skipped／bought から throw・skipped から throw
  （`'Cannot skip a ShoppingItem with status ...'`。SI-TR-07 確定）
- `ShoppingItem.isBought()`: bought で true、それ以外で false
- `ShoppingList.create()`: `status='active'`、`createdAt` が設定される
- `ShoppingList.addItem()`: active で成功／`status='completed'` で throw（D-2）
- `ShoppingList.markAsBought()`: active で成功／completed で throw／存在しない itemId で throw
  （`'ShoppingItem not found'`）
- `ShoppingList.reassignStore()`: 同様の active ガード・item 未検出
- `ShoppingList.markAsSkipped()`: 同様の active ガード
- `ShoppingList.complete()`: active→completed／completed への二重呼び出しで throw（S-8）
- 防御性: `items`/`shoppingDate` の getter が防御的コピーを返す（取得配列への `push`／取得 Date の
  変更が内部状態に影響しない）

**完了条件**

```bash
pnpm --filter @cookpit/domain test        # 全 green
pnpm --filter @cookpit/domain type-check  # 通過
pnpm lint
```

- `Quantity.add()`・`ShoppingListId`・`ShoppingItemId`・`ShoppingItem`・`ShoppingList`・
  `ShoppingListRepository` が全て実装されている
- `packages/domain` 内の他ファイルへの依存が `node:crypto` と同パッケージ内の
  `MealPlanId`/`ProductId`/`StoreId`/`Money`/`Quantity` の型参照のみ（Drizzle・HTTP の型を持ち込んで
  いない）
- S-5 の排他検証・D-2 の active ガード・S-11 の寛容方針（上書き許容）がテストで担保されている

**リスク**: `ShoppingItem`/`ShoppingList` の getter が防御的コピーを返し忘れると、Application 層で
Mapper が Domain の内部状態を書き換えてしまう事故につながる（MealPlan の precedent どおり全 getter に
防御的コピーを徹底する）。

---

### Task 2: Infrastructure 層 — DB スキーマ・Repository の実装

**依存**: Task 1（`ShoppingList`/`ShoppingItem`/`ShoppingListRepository` の型）

**対象ファイル**

| 種別 | ファイル                                                                            | 内容                                                              |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 追記 | `packages/infrastructure/src/db/schema.ts`                                          | `shoppingLists`/`shoppingItems` テーブル定義・型                  |
| 追記 | `packages/infrastructure/src/testing/create-test-db.ts`                             | DDL 文字列に2テーブル追記（IMP-2）                                |
| 新規 | `apps/web/src/db/migrations/0006_xxxxx.sql` + `meta/0006_snapshot.json`             | `drizzle-kit generate` 自動生成（IMP-1）                          |
| 追記 | `apps/web/src/db/migrations/meta/_journal.json`                                     | 自動更新（新エントリ追記）                                        |
| 新規 | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`      | `DrizzleShoppingListRepository`                                   |
| 新規 | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts` | PGlite 統合テスト                                                 |
| 追記 | `packages/infrastructure/src/index.ts`                                              | `export * from './repositories/drizzle-shopping-list.repository'` |

#### 2-1. `schema.ts` 追記（設計 §DB 設計をそのまま転記。S-1 案A・D-6）

```typescript
export const shoppingLists = pgTable('shopping_lists', {
  id: text('id').primaryKey(),
  mealPlanId: text('meal_plan_id').notNull().unique(),
  // ↑ 集約またぎの ID 参照。FK なし（D-6・C-4 先例）。
  //   UNIQUE = 「1 MealPlan : 最大 1 ShoppingList」不変条件（S-6）＋ findByMealPlanId のインデックスを兼ねる
  shoppingDate: date('shopping_date').notNull(), // S-10: 週開始土曜の date
  status: text('status').notNull(), // 'active' | 'completed'（D-6: text）
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type NewShoppingListRow = typeof shoppingLists.$inferInsert;

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    shoppingListId: text('shopping_list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }), // 集約内親子
    productId: text('product_id'), // null 許容・FK なし（集約またぎ・D-6）
    displayName: text('display_name').notNull(),
    requiredAmountValue: numeric('required_amount_value', { precision: 10, scale: 3 }), // S-5 β
    requiredAmountUnit: text('required_amount_unit'), // S-5 β
    amountNote: text('amount_note'), // S-5 β
    targetStoreId: text('target_store_id'), // null 許容・FK なし（D-1/D-6）
    status: text('status').notNull(), // 'pending' | 'bought' | 'skipped'
    actualPriceAmount: numeric('actual_price_amount', { precision: 10, scale: 1 }), // bought 時のみ
    actualStoreId: text('actual_store_id'), // bought 時のみ
    source: text('source').notNull(), // 'from_meal_plan' | 'manually_added'
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('shopping_items_shopping_list_id_idx').on(table.shoppingListId)],
);

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type NewShoppingItemRow = typeof shoppingItems.$inferInsert;
```

`date`/`index`/`numeric`/`pgTable`/`text`/`timestamp` は既存 import 文にすべて含まれているため
import 文の変更は不要（`schema.ts` 先頭を変更しない）。**通貨カラムは持たない**（D-6。復元時に
`'JPY'` を Repository が補う）。既存4テーブル + `mealPlans`/`plannedRecipes` の定義は一切変更しない。

#### 2-2. `create-test-db.ts` DDL 追記（IMP-2。必須）

`DDL` 定数の末尾（`planned_recipes_meal_plan_id_idx` の後）に以下を追記する。カラム名・型・制約を
`schema.ts` と完全一致させる。

```sql
CREATE TABLE IF NOT EXISTS shopping_lists (
  id text PRIMARY KEY,
  meal_plan_id text NOT NULL UNIQUE,
  shopping_date date NOT NULL,
  status text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id text PRIMARY KEY,
  shopping_list_id text NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id text,
  display_name text NOT NULL,
  required_amount_value numeric(10, 3),
  required_amount_unit text,
  amount_note text,
  target_store_id text,
  status text NOT NULL,
  actual_price_amount numeric(10, 1),
  actual_store_id text,
  source text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_items_shopping_list_id_idx ON shopping_items (shopping_list_id);
```

#### 2-3. マイグレーション生成（IMP-1）

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: `apps/web/src/db/migrations/`（`apps/web/drizzle.config.ts` の `out` 設定）
- 生成された `.sql` に `CREATE TABLE "shopping_lists"` と `CREATE TABLE "shopping_items"` が
  含まれること。`shopping_lists` に `UNIQUE("meal_plan_id")` 相当の制約が含まれること
- `meta/_journal.json` に新エントリが追記され、既存 `0000`〜`0005` のエントリは変更しないこと
- 既存6テーブル（`recipes`/`stores`/`products`/`price_records`/`meal_plans`/`planned_recipes`）への
  `ALTER` 文が含まれないこと
- 生成ファイルは手動編集せずそのままコミット対象とする

#### 2-4. `DrizzleShoppingListRepository`（新規）

**模範コード**: `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`
（JOIN グルーピング・`onConflictDoUpdate` + `notInArray` 削除パターン）。
`toUnit`（`packages/infrastructure/src/repositories/mappers.ts`。既存・変更不要）を再利用する。

```typescript
import { and, eq, notInArray } from 'drizzle-orm';
import {
  ShoppingItem,
  ShoppingList,
  type ItemSource,
  type ItemStatus,
  type ShoppingListStatus,
} from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { DrizzleClient } from '../db/client';
import {
  shoppingItems,
  shoppingLists,
  type NewShoppingItemRow,
  type NewShoppingListRow,
  type ShoppingItemRow,
  type ShoppingListRow,
} from '../db/schema';
import { toUnit } from './mappers';

interface ShoppingListWithItemRow {
  shoppingList: ShoppingListRow;
  shoppingItem: ShoppingItemRow | null;
}

interface ShoppingListGroup {
  shoppingList: ShoppingListRow;
  items: ShoppingItemRow[];
}

export class DrizzleShoppingListRepository implements ShoppingListRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: ShoppingListId): Promise<ShoppingList | null> {
    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(eq(shoppingLists.id, id.value));

    if (rows.length === 0) return null;
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null> {
    const rows = await this.db
      .select({ shoppingList: shoppingLists, shoppingItem: shoppingItems })
      .from(shoppingLists)
      .leftJoin(shoppingItems, eq(shoppingLists.id, shoppingItems.shoppingListId))
      .where(eq(shoppingLists.mealPlanId, mealPlanId.value));

    if (rows.length === 0) return null;
    return this.toShoppingLists(rows)[0] ?? null;
  }

  async save(shoppingList: ShoppingList): Promise<void> {
    const listRow = this.toShoppingListRow(shoppingList);
    await this.db
      .insert(shoppingLists)
      .values(listRow)
      .onConflictDoUpdate({
        target: shoppingLists.id,
        // mealPlanId/shoppingDate/createdAt は不変フィールドのため set 対象外
        set: { status: listRow.status },
      });

    const itemRows = this.toShoppingItemRows(shoppingList);
    const currentIds = itemRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db
        .delete(shoppingItems)
        .where(
          and(
            eq(shoppingItems.shoppingListId, shoppingList.id.value),
            notInArray(shoppingItems.id, currentIds),
          ),
        );
    } else {
      await this.db
        .delete(shoppingItems)
        .where(eq(shoppingItems.shoppingListId, shoppingList.id.value));
    }

    for (const row of itemRows) {
      await this.db
        .insert(shoppingItems)
        .values(row)
        .onConflictDoUpdate({
          target: shoppingItems.id,
          set: {
            displayName: row.displayName,
            requiredAmountValue: row.requiredAmountValue,
            requiredAmountUnit: row.requiredAmountUnit,
            amountNote: row.amountNote,
            targetStoreId: row.targetStoreId,
            status: row.status,
            actualPriceAmount: row.actualPriceAmount,
            actualStoreId: row.actualStoreId,
          },
        });
    }
  }

  private toShoppingLists(rows: ShoppingListWithItemRow[]): ShoppingList[] {
    const groups = new Map<string, ShoppingListGroup>();
    for (const row of rows) {
      let group = groups.get(row.shoppingList.id);
      if (group === undefined) {
        group = { shoppingList: row.shoppingList, items: [] };
        groups.set(row.shoppingList.id, group);
      }
      if (row.shoppingItem !== null) {
        group.items.push(row.shoppingItem);
      }
    }
    return [...groups.values()].map((group) => this.toEntity(group.shoppingList, group.items));
  }

  private toEntity(listRow: ShoppingListRow, itemRows: ShoppingItemRow[]): ShoppingList {
    return ShoppingList.reconstruct({
      id: ShoppingListId.fromString(listRow.id),
      mealPlanId: MealPlanId.fromString(listRow.mealPlanId),
      shoppingDate: toDate(listRow.shoppingDate),
      status: toShoppingListStatus(listRow.status),
      createdAt: listRow.createdAt,
      items: itemRows.map((row) =>
        ShoppingItem.reconstruct({
          id: ShoppingItemId.fromString(row.id),
          productId: row.productId === null ? null : ProductId.fromString(row.productId),
          displayName: row.displayName,
          requiredAmount:
            row.requiredAmountValue !== null && row.requiredAmountUnit !== null
              ? Quantity.of(Number(row.requiredAmountValue), toUnit(row.requiredAmountUnit))
              : null,
          amountNote: row.amountNote,
          targetStore: row.targetStoreId === null ? null : StoreId.fromString(row.targetStoreId),
          status: toItemStatus(row.status),
          actualPrice:
            row.actualPriceAmount === null ? null : Money.of(Number(row.actualPriceAmount), 'JPY'),
          actualStore: row.actualStoreId === null ? null : StoreId.fromString(row.actualStoreId),
          source: toItemSource(row.source),
        }),
      ),
    });
  }

  private toShoppingListRow(shoppingList: ShoppingList): NewShoppingListRow {
    return {
      id: shoppingList.id.value,
      mealPlanId: shoppingList.mealPlanId.value,
      shoppingDate: toDateString(shoppingList.shoppingDate),
      status: shoppingList.status,
      createdAt: shoppingList.createdAt,
    };
  }

  private toShoppingItemRows(shoppingList: ShoppingList): NewShoppingItemRow[] {
    return shoppingList.items.map((item) => ({
      id: item.id.value,
      shoppingListId: shoppingList.id.value,
      productId: item.productId?.value ?? null,
      displayName: item.displayName,
      requiredAmountValue: item.requiredAmount ? item.requiredAmount.value.toString() : null,
      requiredAmountUnit: item.requiredAmount?.unit ?? null,
      amountNote: item.amountNote,
      targetStoreId: item.targetStore?.value ?? null,
      status: item.status,
      actualPriceAmount: item.actualPrice ? item.actualPrice.amount.toString() : null,
      actualStoreId: item.actualStore?.value ?? null,
      source: item.source,
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

function toShoppingListStatus(value: string): ShoppingListStatus {
  switch (value) {
    case 'active':
    case 'completed':
      return value;
    default:
      throw new Error(`Unknown shopping list status: ${value}`);
  }
}

function toItemStatus(value: string): ItemStatus {
  switch (value) {
    case 'pending':
    case 'bought':
    case 'skipped':
      return value;
    default:
      throw new Error(`Unknown shopping item status: ${value}`);
  }
}

function toItemSource(value: string): ItemSource {
  switch (value) {
    case 'from_meal_plan':
    case 'manually_added':
      return value;
    default:
      throw new Error(`Unknown shopping item source: ${value}`);
  }
}
```

**実装要点（正確に従うこと）**:

- `numeric` カラムの読み出しは全て `Number()` 変換を入れる（`requiredAmountValue`/`actualPriceAmount`）
- `date` 型カラム（`shoppingDate`）は必ず `'T00:00:00'` を付与してから `new Date()` する
- `Money.of(..., 'JPY')` — 通貨カラムを持たないため常に `'JPY'` を Repository が補う（D-6。
  `DrizzleProductRepository` 147-148 行の確定先例）
- `save()` の `shopping_lists` upsert set 対象は `status` のみ（`mealPlanId`/`shoppingDate`/
  `createdAt` は不変フィールドのため対象外。`DrizzleMealPlanRepository.save()` が `weekStartDate` を
  set 対象外にする先例と同型）
- `shopping_items` の DELETE は `notInArray`（0件時は全 DELETE）。`DrizzleMealPlanRepository`/
  `DrizzleProductRepository` の `save()` と完全に同一パターン

#### 2-5. `infrastructure/src/index.ts` 追記

```typescript
export * from './repositories/drizzle-shopping-list.repository';
```

#### 追加テスト（`drizzle-shopping-list.repository.test.ts`。PGlite 統合。`createTestDb()` 使用）

- `save()` → `findById()`: items 込みで正しく復元される（`mealPlanId`/`shoppingDate`/`status`/
  `items` 一致）
- 空 DB で `findById()`/`findByMealPlanId()` → `null`
- `findByMealPlanId()`: 保存済み `mealPlanId` で取得できる
- **nullability 全パターンの round-trip**: `requiredAmount` 非null＋`amountNote` null（通常材料）、
  `requiredAmount` null＋`amountNote` 非null（適量材料）、`productId`/`targetStoreId`/`actualPrice`/
  `actualStoreId` それぞれ null と非 null
- `meal_plan_id` の UNIQUE 制約違反（同一 `mealPlanId` で2つ目の `ShoppingList` を保存しようとすると
  エラーになる）
- `save()` を同一 `id` で2回呼ぶと `shopping_lists` は1行のまま `status` のみ更新される
  （`mealPlanId`/`shoppingDate` は変化しない）
- item を削除した `ShoppingList` を再 `save()` すると `shopping_items` から該当行が `DELETE` される
  （`notInArray` の 0件分岐を含む）
- `requiredAmountValue`/`actualPriceAmount` が `number` 型で復元される（文字列のまま返らない）
- `shoppingDate` の往復でタイムゾーンのズレがない（保存前後で `toDateString` 相当の値が一致）

**完了条件**

```bash
pnpm --filter @cookpit/infrastructure test        # 全 green
pnpm --filter @cookpit/infrastructure type-check  # 通過
pnpm lint
```

- `schema.ts`/`create-test-db.ts` に既存6テーブル分の変更がないこと
- `ShoppingListRepository` の3メソッド全てが実装されていること
- `save()` が `mealPlanId`/`shoppingDate`/`createdAt` を upsert の `set` に含めていないこと
- マイグレーションが `apps/web/src/db/migrations/` に生成され、既存マイグレーションに変更がないこと

**リスク**: `create-test-db.ts` への DDL 追記漏れ（IMP-2）は Task 2 のテストだけでなく Task 3
（Application）の統合確認にも波及しないが、Task 2 完了条件の `pnpm --filter @cookpit/infrastructure test`
が全滅するため、この時点で確実に検知できる。

---

### Task 3: Application 層 — DTO / Mapper / エラー / UseCase 5本

**依存**: Task 1（Domain の `ShoppingList`/`ShoppingItem`/`ShoppingListRepository`）。実行時の
DI 対象（`MealPlanRepository`/`RecipeRepository`/`ProductRepository`/`ShoppingListRepository`）は
既存インターフェースをそのまま使うため Task 2 の完了を待たなくても型検査は通るが、実際の
Repository 実装配線は Task 5（Presentation）で行う。

**対象ファイル**（すべて `packages/application/src/shopping-list/` に新規作成。既存
`packages/application/src/index.ts` に1行追記）

| #   | ファイル                                          | 内容                                          |
| --- | ------------------------------------------------- | --------------------------------------------- |
| 1   | `shopping-list.dto.ts`                            | DTO 群（IMP-3/IMP-4 反映）                    |
| 2   | `shopping-list.mapper.ts`                         | `toShoppingListDto`/`toShoppingItemDto`       |
| 3   | `shopping-list-not-found.error.ts`                | `ShoppingListNotFoundError`                   |
| 4   | `shopping-item-not-found.error.ts`                | `ShoppingItemNotFoundError`                   |
| 5   | `invalid-shopping-list-state.error.ts`            | `InvalidShoppingListStateError`               |
| 6   | `generate-shopping-list.use-case.ts`              | `GenerateShoppingListUseCase`                 |
| 7   | `add-item.use-case.ts`                            | `AddItemUseCase`                              |
| 8   | `mark-as-bought.use-case.ts`                      | `MarkAsBoughtUseCase`                         |
| 9   | `reassign-store.use-case.ts`                      | `ReassignStoreUseCase`                        |
| 10  | `get-shopping-list.use-case.ts`                   | `GetShoppingListUseCase`（S-7）               |
| 11  | `index.ts`                                        | バレルエクスポート                            |
| 12  | `shopping-list-use-cases.test.ts`                 | 5 UseCase のモック(InMemory)Repository テスト |
| —   | `packages/application/src/index.ts`（既存・追記） | `export * from './shopping-list'`             |

#### 3-1. DTO（`shopping-list.dto.ts`）

設計 §Application 設計のコードを土台に、IMP-3（`unit: Unit`）・IMP-4（`GenerateShoppingListResultDto`）を
適用する。

```typescript
import type { Unit } from '@cookpit/domain/src/shared/unit';

export type ShoppingListStatus = 'active' | 'completed';
export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';

export interface ShoppingItemDto {
  id: string;
  productId: string | null;
  displayName: string;
  requiredAmount: { value: number; unit: Unit } | null; // S-5
  amountNote: string | null; // S-5
  targetStoreId: string | null;
  status: ItemStatus;
  actualPrice: { amount: number; currency: string } | null;
  actualStoreId: string | null;
  source: ItemSource;
}

export interface ShoppingListDto {
  id: string;
  mealPlanId: string;
  shoppingDate: string; // "2026-07-11" 形式（S-10）
  status: ShoppingListStatus;
  items: ShoppingItemDto[];
  createdAt: string; // ISO 8601 datetime
}

export interface GenerateShoppingListInputDto {
  mealPlanId: string;
}

// IMP-4: 201/200 分岐をルート層に伝えるためのラッパー
export interface GenerateShoppingListResultDto {
  shoppingList: ShoppingListDto;
  created: boolean;
}

export interface AddItemInputDto {
  shoppingListId: string;
  displayName: string;
  requiredAmount: { value: number; unit: Unit };
  productId?: string | null;
  targetStoreId?: string | null;
}

export interface MarkAsBoughtInputDto {
  shoppingListId: string;
  itemId: string;
  actualPrice: { amount: number; currency: string };
  actualStoreId: string;
}

export interface ReassignStoreInputDto {
  shoppingListId: string;
  itemId: string;
  targetStoreId: string;
}

export interface GetShoppingListInputDto {
  shoppingListId: string;
}
```

#### 3-2. Mapper（`shopping-list.mapper.ts`）

**重要**: `shoppingDate` はローカル日付整形（`toISOString().slice(0,10)` を使わない。JST で
`toISOString()` を使うと前日にずれる。`DrizzleMealPlanRepository.toDateString` と同方式）。

```typescript
import type { ShoppingItem, ShoppingList } from '@cookpit/domain/src/shopping-list/shopping-list';
import type { ShoppingItemDto, ShoppingListDto } from './shopping-list.dto';

export function toShoppingItemDto(item: ShoppingItem): ShoppingItemDto {
  return {
    id: item.id.value,
    productId: item.productId?.value ?? null,
    displayName: item.displayName,
    requiredAmount: item.requiredAmount
      ? { value: item.requiredAmount.value, unit: item.requiredAmount.unit }
      : null,
    amountNote: item.amountNote,
    targetStoreId: item.targetStore?.value ?? null,
    status: item.status,
    actualPrice: item.actualPrice
      ? { amount: item.actualPrice.amount, currency: item.actualPrice.currency }
      : null,
    actualStoreId: item.actualStore?.value ?? null,
    source: item.source,
  };
}

export function toShoppingListDto(shoppingList: ShoppingList): ShoppingListDto {
  return {
    id: shoppingList.id.value,
    mealPlanId: shoppingList.mealPlanId.value,
    shoppingDate: toLocalDateString(shoppingList.shoppingDate),
    status: shoppingList.status,
    items: shoppingList.items.map(toShoppingItemDto),
    createdAt: shoppingList.createdAt.toISOString(),
  };
}

// DrizzleMealPlanRepository.toDateString と同方式。JST 前日ずれ回避のため
// toISOString().slice(0, 10) は使わない
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

**スコープ外の気づき（修正しない。改善候補として報告のみ）**: 既存 `meal-plan.mapper.ts` の
`toPlannedRecipeDto` は `scheduledDate?.toISOString().slice(0, 10)` を使っており、JST で非 null 値を
扱うと前日にずれる潜在バグがある（設計 §Application 設計で報告済み）。本ユニットでは触らない。

#### 3-3. エラークラス3種

```typescript
// shopping-list-not-found.error.ts
export class ShoppingListNotFoundError extends Error {
  constructor(shoppingListId: string) {
    super(`ShoppingList not found: ${shoppingListId}`);
    this.name = 'ShoppingListNotFoundError';
  }
}
```

```typescript
// shopping-item-not-found.error.ts
export class ShoppingItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`ShoppingItem not found: ${itemId}`);
    this.name = 'ShoppingItemNotFoundError';
  }
}
```

```typescript
// invalid-shopping-list-state.error.ts
import type { ShoppingListStatus } from './shopping-list.dto';

export class InvalidShoppingListStateError extends Error {
  constructor(current: ShoppingListStatus, operation: string) {
    super(`Cannot ${operation} a ShoppingList with status '${current}'`);
    this.name = 'InvalidShoppingListStateError';
  }
}
```

Generate で MealPlan が draft でない場合のエラーは新規クラスを作らず、既存
`InvalidMealPlanStateError`（`packages/application/src/meal-plan/invalid-meal-plan-state.error.ts`）を
`new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from')` の形で流用する
（import 元は `../meal-plan/invalid-meal-plan-state.error`。`onError` の 422 分岐も既存のまま使える）。

#### 3-4. `GenerateShoppingListUseCase`

**依存 Repository**: `MealPlanRepository`・`RecipeRepository`・`ProductRepository`・
`ShoppingListRepository`（S-2: `PantryRepository` は注入しない。D-3: `StoreRepository` も不要）。

**IMP-5 厳守**: `product/product-id.ts` の `ProductId` のみを名前付きインポートする。
`recipe-ingredient.ts` 側のローカル型 `ProductId`（構造的インターフェース）は明示インポートしない
（`ingredient.productRef?.value` でアクセスすれば型推論で足りる）。

```typescript
import { MealPlan } from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import type { PlannedRecipe } from '@cookpit/domain/src/meal-plan/meal-plan';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItem, ShoppingList } from '@cookpit/domain/src/shopping-list/shopping-list';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidMealPlanStateError } from '../meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../meal-plan/meal-plan-not-found.error';
import type {
  GenerateShoppingListInputDto,
  GenerateShoppingListResultDto,
} from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';

interface ResolvedIngredient {
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null; // null の場合は amountNote が非 null（S-5）
  amountNote: string | null;
}

export class GenerateShoppingListUseCase {
  constructor(
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly recipeRepository: RecipeRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
  ) {}

  async execute(input: GenerateShoppingListInputDto): Promise<GenerateShoppingListResultDto> {
    const mealPlanId = MealPlanId.fromString(input.mealPlanId);
    const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(input.mealPlanId);
    }

    // S-6 冪等判定・部分失敗の自己修復
    const existing = await this.shoppingListRepository.findByMealPlanId(mealPlanId);
    if (existing !== null) {
      if (mealPlan.status === 'draft') {
        mealPlan.transitionTo('shopping');
        await this.mealPlanRepository.save(mealPlan);
      }
      return { shoppingList: toShoppingListDto(existing), created: false };
    }

    if (mealPlan.status !== 'draft') {
      throw new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from');
    }

    const resolved = await this.resolveRecipes(mealPlan);
    const aggregated = this.aggregateIngredients(resolved);
    const targetStoreMap = await this.resolveTargetStores(aggregated);

    const items = aggregated.map((ingredient) =>
      ShoppingItem.create({
        productId: ingredient.productId,
        displayName: ingredient.displayName,
        requiredAmount: ingredient.requiredAmount,
        amountNote: ingredient.amountNote,
        targetStore:
          ingredient.productId !== null
            ? (targetStoreMap.get(ingredient.productId.value) ?? null)
            : null,
        source: 'from_meal_plan',
      }),
    );

    const shoppingList = ShoppingList.create({
      mealPlanId,
      items,
      shoppingDate: mealPlan.weekOf.startDate(), // S-10
    });

    // S-6-3: 保存順は「ShoppingList 保存 → MealPlan 遷移・保存」
    await this.shoppingListRepository.save(shoppingList);
    mealPlan.transitionTo('shopping');
    await this.mealPlanRepository.save(mealPlan);

    return { shoppingList: toShoppingListDto(shoppingList), created: true };
  }

  // D-4: findByIds は新設せず findById ループ。D-8: 削除済み Recipe はスキップ
  private async resolveRecipes(
    mealPlan: MealPlan,
  ): Promise<Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>> {
    const uniqueRecipeIds = [...new Set(mealPlan.plannedRecipes.map((pr) => pr.recipeId.value))];
    const recipes = await Promise.all(
      uniqueRecipeIds.map((id) => this.recipeRepository.findById(RecipeId.fromString(id))),
    );
    const recipeMap = new Map<string, Recipe>();
    uniqueRecipeIds.forEach((id, index) => {
      const recipe = recipes[index];
      if (recipe !== null) {
        recipeMap.set(id, recipe);
      }
    });

    const resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }> = [];
    for (const plannedRecipe of mealPlan.plannedRecipes) {
      const recipe = recipeMap.get(plannedRecipe.recipeId.value);
      if (recipe === undefined) {
        continue; // D-8: 削除済み Recipe はスキップ
      }
      resolved.push({ plannedRecipe, recipe });
    }
    return resolved;
  }

  // S-4: 同一キー・同一単位のみ Quantity.add() で合算。amount=null は個別行のまま（S-5）
  private aggregateIngredients(
    resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>,
  ): ResolvedIngredient[] {
    const aggregated = new Map<
      string,
      { productId: ProductId | null; displayName: string; requiredAmount: Quantity }
    >();
    const individual: ResolvedIngredient[] = [];

    for (const { plannedRecipe, recipe } of resolved) {
      const scaled = recipe.scaleIngredients(plannedRecipe.scaleFactor);
      for (const ingredient of scaled) {
        const productId =
          ingredient.productRef !== null ? ProductId.fromString(ingredient.productRef.value) : null;

        if (ingredient.amount === null) {
          individual.push({
            productId,
            displayName: ingredient.displayName,
            requiredAmount: null,
            amountNote: ingredient.amountNote,
          });
          continue;
        }

        const key = `${productId !== null ? productId.value : ingredient.displayName.trim()}|${ingredient.amount.unit}`;
        const existingEntry = aggregated.get(key);
        if (existingEntry === undefined) {
          aggregated.set(key, {
            productId,
            displayName: ingredient.displayName,
            requiredAmount: ingredient.amount,
          });
        } else {
          aggregated.set(key, {
            ...existingEntry,
            requiredAmount: existingEntry.requiredAmount.add(ingredient.amount),
          });
        }
      }
    }

    const aggregatedResult: ResolvedIngredient[] = [...aggregated.values()].map((entry) => ({
      productId: entry.productId,
      displayName: entry.displayName,
      requiredAmount: entry.requiredAmount,
      amountNote: null,
    }));

    return [...aggregatedResult, ...individual];
  }

  // S-3 案A + D-1: productRef 引き継ぎのみ。最安店舗が決定できなければ null
  private async resolveTargetStores(
    ingredients: ResolvedIngredient[],
  ): Promise<Map<string, StoreId | null>> {
    const uniqueProductIds = [
      ...new Set(
        ingredients
          .map((ingredient) => ingredient.productId)
          .filter((productId): productId is ProductId => productId !== null)
          .map((productId) => productId.value),
      ),
    ];

    const products = await Promise.all(
      uniqueProductIds.map((id) => this.productRepository.findById(ProductId.fromString(id))),
    );

    const storeMap = new Map<string, StoreId | null>();
    uniqueProductIds.forEach((id, index) => {
      const product = products[index];
      storeMap.set(id, product?.cheapestStoreAt(new Date()) ?? null);
    });
    return storeMap;
  }
}
```

**実装要点**:

- `resolveRecipes`/`aggregateIngredients`/`resolveTargetStores` は private メソッドに分割する
  （設計 §Application 設計「S-3 を将来案 C に変える場合の変更点を `aggregateIngredients` 後段の
  productId 解決に閉じ込める」の指示どおり）
- `ShoppingItem.create()` の `requiredAmount`/`amountNote` 排他は Domain 側（Task 1）で保証されるため
  ここでは二重チェックしない
- D-7（空 plannedRecipes 許容）: `mealPlan.plannedRecipes` が空でも `resolveRecipes`/
  `aggregateIngredients` はそのまま空配列を返し、`items: []` の `ShoppingList` が作成される
  （特別分岐は不要）

#### 3-5. `AddItemUseCase`

```typescript
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItem } from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { AddItemInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

export class AddItemUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: AddItemInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'addItem');
    }

    const item = ShoppingItem.create({
      productId: input.productId ? ProductId.fromString(input.productId) : null,
      displayName: input.displayName,
      requiredAmount: Quantity.of(input.requiredAmount.value, input.requiredAmount.unit),
      amountNote: null, // Unit A の AddItem は amountNote 付き追加を受け付けない（§契約確定仕様 §2）
      targetStore: input.targetStoreId ? StoreId.fromString(input.targetStoreId) : null,
      source: 'manually_added',
    });

    shoppingList.addItem(item);
    await this.shoppingListRepository.save(shoppingList);

    return toShoppingItemDto(item);
  }
}
```

#### 3-6. `MarkAsBoughtUseCase` / `ReassignStoreUseCase`

```typescript
// mark-as-bought.use-case.ts
import { Money } from '@cookpit/domain/src/shared/money';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { MarkAsBoughtInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

export class MarkAsBoughtUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: MarkAsBoughtInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'markAsBought');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    try {
      shoppingList.markAsBought(
        itemId,
        Money.of(input.actualPrice.amount, input.actualPrice.currency),
        StoreId.fromString(input.actualStoreId),
      );
    } catch {
      // 手順2で status ガードは通過済みのため、ここに来るのは item 未検出のみ
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    await this.shoppingListRepository.save(shoppingList);

    const updated = shoppingList.items.find((item) => item.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
```

`ReassignStoreUseCase` は同型（`shoppingList.reassignStore(itemId, StoreId.fromString(input.targetStoreId))`
に置き換えるのみ。operation 文字列は `'reassignStore'`）。

#### 3-7. `GetShoppingListUseCase`（S-7）

```typescript
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import type { GetShoppingListInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

export class GetShoppingListUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: GetShoppingListInputDto): Promise<ShoppingListDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    return toShoppingListDto(shoppingList);
  }
}
```

#### 3-8. `index.ts`

```typescript
export * from './generate-shopping-list.use-case';
export * from './add-item.use-case';
export * from './mark-as-bought.use-case';
export * from './reassign-store.use-case';
export * from './get-shopping-list.use-case';
export * from './shopping-list.dto';
export * from './shopping-list.mapper';
export * from './shopping-list-not-found.error';
export * from './shopping-item-not-found.error';
export * from './invalid-shopping-list-state.error';
```

#### 3-9. `packages/application/src/index.ts` 追記

```typescript
// application package
export * from './recipe';
export * from './store';
export * from './product';
export * from './meal-plan';
export * from './shopping-list';
```

#### 追加テスト（`shopping-list-use-cases.test.ts`）

`meal-plan-use-cases.test.ts` と同じ形式（`InMemoryMealPlanRepository`/`InMemoryRecipeRepository`/
`InMemoryProductRepository`/`InMemoryShoppingListRepository` を自前実装し、5 UseCase をまとめて
1 ファイルでテストする）。詳細な網羅ケースは `docs/tests/shopping-list-core.md`（test-designer 成果物）
に委ねるが、少なくとも以下を含める。

- **GenerateShoppingListUseCase**: 正常生成（複数レシピ・合算あり）／存在しない mealPlanId で
  `MealPlanNotFoundError`／MealPlan が draft 以外かつ既存リストなしで `InvalidMealPlanStateError`／
  **冪等再実行**（2回目は既存を返し `created: false`、`shoppingListRepository.save` 呼び出し回数が
  増えない）／**部分失敗の自己修復**（既存リストあり + `MealPlan.status === 'draft'` なら
  `transitionTo`+`save` が実行される）／既存リストあり + `MealPlan.status === 'cooking'` は遷移せず
  既存をそのまま返す／削除済み Recipe（`recipeRepository.findById` が null）はスキップされ他の材料は
  生成される（D-8）／空 `plannedRecipes` で `items: []` の ShoppingList が生成される（D-7）／
  **集計キー境界**: 同一 `productId`・同一単位は合算、同一 `displayName` でも単位が異なれば別行、
  `amount=null`（適量材料）は個別行のまま残る／`scaleFactor` 小数（例 1.5）での数量精度／
  `productId` なし・価格履歴なしの材料は `targetStoreId: null`（D-1）
- **AddItemUseCase**: 正常追加（`source: 'manually_added'`）／`productId`/`targetStoreId` 指定・
  未指定の組み合わせ／存在しない `shoppingListId` で `ShoppingListNotFoundError`／`status: 'completed'`
  の ShoppingList への追加で `InvalidShoppingListStateError`
- **MarkAsBoughtUseCase**: 正常マーク（`actualPrice`/`actualStoreId` が記録される）／存在しない
  `shoppingListId`/`itemId` でそれぞれ `ShoppingListNotFoundError`/`ShoppingItemNotFoundError`／
  completed への適用で `InvalidShoppingListStateError`／既に bought の item への再適用（上書き。S-11a）／
  skipped の item への適用（S-11b）
- **ReassignStoreUseCase**: 正常変更／`bought` の item への適用で `targetStoreId` のみ変わり
  `actualPrice`/`actualStoreId` は不変（S-11c）／存在しない `itemId`
- **GetShoppingListUseCase**: 正常取得／存在しない `shoppingListId` で `ShoppingListNotFoundError`

**完了条件**

```bash
pnpm --filter @cookpit/application test        # 全 green
pnpm --filter @cookpit/application type-check  # 通過
pnpm lint
```

- 5 UseCase 全てが実装され、コンストラクタで受け取る Repository が設計どおり最小限
  （`GenerateShoppingListUseCase` のみ4種、他は `ShoppingListRepository` のみ）
- `GenerateShoppingListUseCase` が冪等（既存リストがあれば `save` を呼ばずに返す）であること
- `InvalidShoppingListStateError`/`ShoppingListNotFoundError`/`ShoppingItemNotFoundError` が
  要件書 §7 の異常系どおり適切に投げ分けられること

**リスク**: `aggregateIngredients` の集計キー生成（`productId.value ?? displayName.trim()`）を
誤ると、S-4 の「同一材料の合算」が機能しない、または無関係の材料が誤って合算される。単体テストで
「同一 displayName・異なる unit は合算しない」「同一 productId・同一 unit は合算する」の両方を
明示的に検証すること。

---

### Task 4: API Contract 層 — Zod スキーマ

**依存**: なし（型のみの独立実装。Task 3 の DTO 構造と整合させる必要はあるが、パッケージとしての
依存関係はない。IMP-6: Vitest は既に導入済みのため追加設定不要）

**対象ファイル**

| 種別 | ファイル                                                 | 内容                                     |
| ---- | -------------------------------------------------------- | ---------------------------------------- |
| 新規 | `packages/api-contract/src/shopping-list.schema.ts`      | Zod スキーマ一式                         |
| 新規 | `packages/api-contract/src/shopping-list.schema.test.ts` | 契約テスト                               |
| 追記 | `packages/api-contract/src/index.ts`                     | `export * from './shopping-list.schema'` |

#### 4-1. `shopping-list.schema.ts`（§契約確定仕様 §1〜§7 をそのまま転記）

```typescript
import z from 'zod';
import { unitSchema } from './recipe.schema';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

// 1. Generate
export const generateShoppingListSchema = z.object({
  mealPlanId: z.uuid(),
});

// 2. AddItem
export const addItemSchema = z.object({
  displayName: nonBlankString,
  requiredAmount: z.object({
    value: z.number().min(0),
    unit: unitSchema,
  }),
  productId: z.uuid().nullable(),
  targetStoreId: z.uuid().nullable(),
});

// 3. MarkAsBought
export const markAsBoughtSchema = z.object({
  actualPrice: z.object({
    amount: z.number().min(0),
    currency: z.literal('JPY'),
  }),
  actualStoreId: z.uuid(),
});

// 4. ReassignStore
export const reassignStoreSchema = z.object({
  targetStoreId: z.uuid(),
});

// 5. param
export const shoppingListIdParamSchema = z.object({
  id: z.uuid(),
});

export const shoppingItemIdParamSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
});

// 6. response
export const itemStatusSchema = z.enum(['pending', 'bought', 'skipped']);
export const itemSourceSchema = z.enum(['from_meal_plan', 'manually_added']);
export const shoppingListStatusSchema = z.enum(['active', 'completed']);

export const shoppingItemResponseSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid().nullable(),
    displayName: z.string(),
    requiredAmount: z.object({ value: z.number(), unit: unitSchema }).nullable(),
    amountNote: z.string().nullable(),
    targetStoreId: z.uuid().nullable(),
    status: itemStatusSchema,
    actualPrice: z.object({ amount: z.number(), currency: z.literal('JPY') }).nullable(),
    actualStoreId: z.uuid().nullable(),
    source: itemSourceSchema,
  })
  .superRefine((value, ctx) => {
    const hasRequiredAmount = value.requiredAmount !== null;
    const hasAmountNote = value.amountNote !== null;
    if (hasRequiredAmount === hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['requiredAmount'],
        message: 'Exactly one of requiredAmount or amountNote must be set',
      });
    }
  });

export const shoppingListResponseSchema = z.object({
  id: z.uuid(),
  mealPlanId: z.uuid(),
  shoppingDate: z.iso.date(),
  status: shoppingListStatusSchema,
  items: z.array(shoppingItemResponseSchema),
  createdAt: z.iso.datetime(),
});

export type GenerateShoppingListBody = z.infer<typeof generateShoppingListSchema>;
export type AddItemBody = z.infer<typeof addItemSchema>;
export type MarkAsBoughtBody = z.infer<typeof markAsBoughtSchema>;
export type ReassignStoreBody = z.infer<typeof reassignStoreSchema>;
export type ShoppingListIdParam = z.infer<typeof shoppingListIdParamSchema>;
export type ShoppingItemIdParam = z.infer<typeof shoppingItemIdParamSchema>;
export type ItemStatusSchemaType = z.infer<typeof itemStatusSchema>;
export type ItemSourceSchemaType = z.infer<typeof itemSourceSchema>;
export type ShoppingListStatusSchemaType = z.infer<typeof shoppingListStatusSchema>;
export type ShoppingItemResponse = z.infer<typeof shoppingItemResponseSchema>;
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;
```

**厳守事項（§契約確定仕様 §0/§8）**:

- `unitSchema` は新規列挙せず `import { unitSchema } from './recipe.schema'` で再利用する
- **`errorResponseSchema` は本ファイルに再定義しない**。`meal-plan.schema.ts` が既にエクスポート
  済みで、`index.ts` は両ファイルを `export *` するため、同名を2箇所でエクスポートすると ESM の
  名前衝突になる。エラーレスポンスの型が必要な場合は
  `import { errorResponseSchema } from './meal-plan.schema'` として再利用する（本ファイル内で
  実際に使う箇所がなければ import 自体も不要）
- `requiredAmount.value`/`actualPrice.amount` は `z.number().min(0)`（0 以上。`.positive()` ではない。
  `Quantity.of`/`Money.of` の非負検証と一致させる）
- `actualPrice.currency` は `z.literal('JPY')` 固定
- `productId`/`targetStoreId`（`addItemSchema`）は `.nullable()` のみ（`.optional()` を付けない。
  キー省略は reject、`null` の明示のみ許容）

#### 4-2. `index.ts` 追記

```typescript
// api-contract package
export * from './recipe.schema';
export * from './product.schema';
export * from './store.schema';
export * from './meal-plan.schema';
export * from './shopping-list.schema';
```

#### 追加テスト（`shopping-list.schema.test.ts`）

設計 §契約確定仕様 §15「契約テスト方針」の観点表を最低限カバーする（詳細な網羅は test-designer が
`docs/tests/shopping-list-core.md` で確定する）。

- `generateShoppingListSchema`: 正常な `mealPlanId` の parse 通過／不正 UUID の reject
- `addItemSchema`: `displayName` 空文字・空白のみの reject／`requiredAmount.value` 境界（`0` accept・
  負数 reject）／`requiredAmount.unit` の17値 enum 外 reject／`productId`/`targetStoreId` の `null`
  accept・キー省略（`undefined`）reject
- `markAsBoughtSchema`: `actualPrice.amount` 境界（`0` accept・負数 reject）／`actualPrice.currency`
  が `'JPY'` 以外（例 `'USD'`）で reject／`actualStoreId` 不正 UUID の reject
- `reassignStoreSchema`: `targetStoreId` 不正 UUID の reject
- param スキーマ: `id`/`itemId` 不正 UUID の reject
- `shoppingItemResponseSchema`: `requiredAmount`/`amountNote` が両方 `null` または両方非 `null` で
  reject（`superRefine`。S-5 の最重要契約テスト）／どちらか一方のみ非 `null` で accept（2パターン）／
  `productId`/`targetStoreId`/`actualPrice`/`actualStoreId` の null・非 null 両パターン
- `shoppingListResponseSchema`: `toShoppingListDto`/`toShoppingItemDto`（Task 3 の Mapper）の実出力が
  `.parse()` を通過する型往復テスト（items 0件の空配列ケースを含む）
- 既存契約への非破壊確認: `recipe.schema.ts`/`product.schema.ts`/`store.schema.ts`/
  `meal-plan.schema.ts` の既存 `.test.ts` が green のまま保たれること

**完了条件**

```bash
pnpm --filter @cookpit/api-contract test        # 全 green
pnpm --filter @cookpit/api-contract type-check  # 通過
```

- `errorResponseSchema` が再定義されていないこと（`meal-plan.schema.ts` からの import のみ、または
  未使用なら import 自体なし）
- 既存 `product.schema.ts`/`store.schema.ts`/`recipe.schema.ts`/`meal-plan.schema.ts` に変更が
  ないこと

**リスク**: `errorResponseSchema` を誤って再定義すると `index.ts` の `export *` が ESM 名前衝突で
ビルドエラーになる。Task 4 の完了条件で明示的にチェックする。

---

### Task 5: Presentation 層 — Hono ルート + app.ts 統合

**依存**: Task 2（`DrizzleShoppingListRepository` ほか既存 Repository の再利用）、Task 3
（UseCase・IMP-4 の `GenerateShoppingListResultDto`）、Task 4（Zod スキーマ）すべて完了していること。

**対象ファイル**

| 種別 | ファイル                                            | 内容                                           |
| ---- | --------------------------------------------------- | ---------------------------------------------- |
| 新規 | `apps/web/src/server/routes/shopping-lists.ts`      | `shoppingListsRoute`（Hono、5 エンドポイント） |
| 新規 | `apps/web/src/server/routes/shopping-lists.test.ts` | Hono テストクライアントによるルートテスト      |
| 追記 | `apps/web/src/server/app.ts`                        | マウント + `onError` に新規エラー3種の分岐追加 |

#### 5-1. `shoppingListsRoute`（`meal-plans.ts` のパターン踏襲。手動 DI ファクトリ関数）

```typescript
import { getDb } from '@/db/client';
import {
  addItemSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  shoppingItemIdParamSchema,
  shoppingListIdParamSchema,
} from '@cookpit/api-contract';
import {
  AddItemUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  MarkAsBoughtUseCase,
  ReassignStoreUseCase,
} from '@cookpit/application';
import {
  DrizzleMealPlanRepository,
  DrizzleProductRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
} from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function shoppingListRepository(): DrizzleShoppingListRepository {
  return new DrizzleShoppingListRepository(getDb());
}
function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}
function recipeRepository(): DrizzleRecipeRepository {
  return new DrizzleRecipeRepository(getDb());
}
function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(getDb());
}

export const shoppingListsRoute = new Hono()
  .post('/', zValidator('json', generateShoppingListSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new GenerateShoppingListUseCase(
      mealPlanRepository(),
      recipeRepository(),
      productRepository(),
      shoppingListRepository(),
    );
    const result = await usecase.execute(body);
    // IMP-4 / §契約確定仕様 §10: 新規 201・冪等既存返却 200
    return c.json(result.shoppingList, result.created ? 201 : 200);
  })
  .get('/:id', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new GetShoppingListUseCase(shoppingListRepository());
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  })
  .post(
    '/:id/items',
    zValidator('param', shoppingListIdParamSchema),
    zValidator('json', addItemSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new AddItemUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, ...body });
      return c.json(dto, 201);
    },
  )
  .post(
    '/:id/items/:itemId/bought',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', markAsBoughtSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new MarkAsBoughtUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  )
  .post(
    '/:id/items/:itemId/target-store',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', reassignStoreSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new ReassignStoreUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  );
```

`DrizzleMealPlanRepository`/`DrizzleProductRepository`/`DrizzleRecipeRepository`/
`DrizzleShoppingListRepository` はすべて既存 `@cookpit/infrastructure` からエクスポート済み
（`DrizzleShoppingListRepository` は Task 2 で追加）。新規 import 追加のみで既存 Repository の
実装には触れない。

#### 5-2. `app.ts` 追記

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { mealPlansRoute } from './routes/meal-plans';
import { productsRoute } from './routes/products';
import { recipesRoute } from './routes/recipes';
import { shoppingListsRoute } from './routes/shopping-lists';
import { storesRoute } from './routes/stores';
import {
  InvalidMealPlanStateError,
  InvalidShoppingListStateError,
  MealPlanNotFoundError,
  PlannedRecipeNotFoundError,
  ProductNotFoundError,
  RecipeNotFoundError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
  StoreNotFoundError,
} from '@cookpit/application';
const app = new Hono().basePath('/api');

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute)
  .route('/shopping-lists', shoppingListsRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ProductNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof MealPlanNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof PlannedRecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidMealPlanStateError) {
    return c.json({ error: err.message }, 422);
  }
  if (err instanceof ShoppingListNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ShoppingItemNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidShoppingListStateError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
```

既存6分岐（Recipe/Product/Store/MealPlan/PlannedRecipe/InvalidMealPlanState）の順序・挙動は変更
しない（新規3分岐は末尾に追記するのみ）。

#### 追加テスト（`shopping-lists.test.ts`）

`meal-plans.test.ts`/`products.test.ts` と同じ形式（`vi.mock('@/db/client')` + `vi.mock('@cookpit/application', ...)`
で UseCase をモック化し、Route の入出力配線のみを検証。Repository・DB 接続は行わない）。

- `POST /api/shopping-lists`: 正常系で `GenerateShoppingListUseCase.execute` が呼ばれ、
  `result.created` に応じて **201 と 200 の両方**が正しく返ることを個別に検証（IMP-4/§契約確定仕様
  §10 の最重要観点）
- `GET /api/shopping-lists/:id`: 200 + `ShoppingListDto`
- `POST /api/shopping-lists/:id/items`: 201 + `ShoppingItemDto`
- `POST /api/shopping-lists/:id/items/:itemId/bought`: 200 + `ShoppingItemDto`
- `POST /api/shopping-lists/:id/items/:itemId/target-store`: 200 + `ShoppingItemDto`
- 各エンドポイントの 400（Zod バリデーション失敗）／404（`ShoppingListNotFoundError`/
  `ShoppingItemNotFoundError`/`MealPlanNotFoundError`）／422（`InvalidShoppingListStateError`/
  `InvalidMealPlanStateError`）

**完了条件**

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web test
pnpm lint
```

- 5 エンドポイント全てが§契約確定仕様 §10 の表どおりの HTTP メソッド・パス・ステータスで動作する
- `POST /api/shopping-lists` が新規生成時 201・冪等時 200 を正しく返し分ける
- `app.ts` の既存6分岐（Recipe/Product/Store/MealPlan/PlannedRecipe/InvalidMealPlanState）が
  変更されていない

**リスク**: `result.created` の判定を誤ると（例: 常に `created: true` を返す実装ミス）契約上
確定した「冪等時 200」が実現されない。ルートテストで両方のケースを明示的に区別して検証することで
検知する。

---

## 変更対象ファイル一覧（サマリ）

### 既存ファイルへの追記（8 ファイル）

| #   | ファイルパス                                            | 変更内容                                      | タスク |
| --- | ------------------------------------------------------- | --------------------------------------------- | ------ |
| 1   | `packages/domain/src/shared/quantity.ts`                | `add()` 追加                                  | Task 1 |
| 2   | `packages/domain/src/shared/quantity.test.ts`           | `add()` テスト追加                            | Task 1 |
| 3   | `packages/infrastructure/src/db/schema.ts`              | `shoppingLists`/`shoppingItems` 追記          | Task 2 |
| 4   | `packages/infrastructure/src/testing/create-test-db.ts` | DDL 追記（IMP-2）                             | Task 2 |
| 5   | `apps/web/src/db/migrations/meta/_journal.json`         | 自動更新                                      | Task 2 |
| 6   | `packages/infrastructure/src/index.ts`                  | `DrizzleShoppingListRepository` export 追記   | Task 2 |
| 7   | `packages/application/src/index.ts`                     | `export * from './shopping-list'` 追記        | Task 3 |
| 8   | `packages/api-contract/src/index.ts`                    | `export * from './shopping-list.schema'` 追記 | Task 4 |
| 9   | `apps/web/src/server/app.ts`                            | マウント + onError 3分岐追記                  | Task 5 |

### 新規作成ファイル

#### Domain（Task 1・7ファイル）

`shopping-list-id.ts` / `shopping-item-id.ts` / `shopping-list.ts` / `shopping-list.repository.ts` /
`shopping-list-id.test.ts` / `shopping-item-id.test.ts`（IMP-7） / `shopping-list.test.ts`

#### Infrastructure（Task 2・2ファイル + マイグレーション自動生成）

`drizzle-shopping-list.repository.ts` / `drizzle-shopping-list.repository.test.ts` /
`apps/web/src/db/migrations/0006_xxxxx.sql` + `meta/0006_snapshot.json`（`drizzle-kit generate` 自動生成）

#### Application（Task 3・12ファイル）

`shopping-list.dto.ts` / `shopping-list.mapper.ts` / `shopping-list-not-found.error.ts` /
`shopping-item-not-found.error.ts` / `invalid-shopping-list-state.error.ts` /
`generate-shopping-list.use-case.ts` / `add-item.use-case.ts` / `mark-as-bought.use-case.ts` /
`reassign-store.use-case.ts` / `get-shopping-list.use-case.ts` / `index.ts` /
`shopping-list-use-cases.test.ts`

#### API Contract（Task 4・2ファイル）

`shopping-list.schema.ts` / `shopping-list.schema.test.ts`

#### Presentation（Task 5・2ファイル）

`shopping-lists.ts` / `shopping-lists.test.ts`

合計: 新規ファイル 25（うちテスト 8）+ マイグレーション自動生成分、既存ファイル追記 9。

---

## 依存関係と実装順

```
Task 1（Domain: Quantity.add + ShoppingList集約 + Repository IF）
  └─→ Task 2（Infrastructure: schema/DDL/migration/Repository実装）※ Task 1 の型に依存
        └─→ Task 3（Application: DTO/Mapper/Error/UseCase×5）
              ※ 型検査は Task 1 のみで通るが、実配線確認（統合的な手動テスト）は
                Task 2 完了後が望ましい。Codex 実行順としては Task 2 → Task 3 を推奨
              ├─→ Task 4（API Contract: 独立に進行可。Task 3 の DTO 構造と整合させる）
              └─→ Task 5（Presentation）※ Task 3 の UseCase・Task 4 の Zod スキーマ双方に依存
```

- Task 4（API Contract）は Task 3 と並行着手できるが、レスポンススキーマ
  （`shoppingItemResponseSchema`/`shoppingListResponseSchema`）は Task 3 の Mapper 出力構造と
  一致させる必要があるため、型往復の契約テストは Task 3 完了後に実施する
- meal-plan-core の先例（`docs/tasks/codex/meal-plan-core/README.md`）どおり、**番号順に実行する**
  ことを Codex ブリーフに明記する

---

## 各タスクの完了条件（横断チェックリスト）

| Task             | 品質ゲート                                                           | 追加チェック                                                                                                               |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1 Domain         | `pnpm --filter @cookpit/domain test/type-check`, `pnpm lint`         | S-5 排他検証・D-2 active ガード・S-11 寛容方針（上書き許容）がテストで担保、全 getter が防御的コピー                       |
| 2 Infrastructure | `pnpm --filter @cookpit/infrastructure test/type-check`, `pnpm lint` | 既存6テーブル無変更、マイグレーションが `apps/web/src/db/migrations/` に生成、`save()` が不変フィールドを set 対象外にする |
| 3 Application    | `pnpm --filter @cookpit/application test/type-check`, `pnpm lint`    | Generate の冪等性・部分失敗修復・D-8 スキップ・D-7 空リスト許容がテストで担保                                              |
| 4 API Contract   | `pnpm --filter @cookpit/api-contract test/type-check`                | `errorResponseSchema` 再定義なし、既存4契約ファイル無変更                                                                  |
| 5 Presentation   | `pnpm --filter @cookpit/web test/type-check`, `pnpm lint`            | 201/200 分岐の実動作確認、既存 onError 6分岐無変更                                                                         |
| 全体             | `pnpm lint` / `pnpm type-check` / `pnpm test`（ルート）              | 既存テスト（Recipe/Product/Store/MealPlan/health）に regression なし                                                       |

---

## テスト計画への参照

各タスクの「追加テスト」節は実装計画作成時点での最低限の観点であり、**詳細な試験ケース網羅
（正常系・異常系・境界条件の完全な一覧、ケース番号採番）は test-designer が
`docs/tests/shopping-list-core.md` として別途確定する**。特に以下は設計 §テスト方針で明示された
設計由来の観点であり、test-designer の試験計画に必ず反映されるべき事項として申し送る。

- Domain: `amount`/`amountNote` 排他検証、active ガード（D-2）、markAsBought の上書き（S-11a）と
  skipped→bought（S-11b）、markAsSkipped（S-9）、complete() の二重呼び出し拒否（S-8）、
  `Quantity.add()` の単位不一致 throw・0加算・合算値（S-4）
- Application（Generate）: 冪等再実行、**部分失敗の修復分岐**、既存リストあり+MealPlan=cooking等、
  削除済み Recipe スキップ（D-8）、空 plannedRecipes（D-7）、集計キー境界、scaleFactor 小数精度
- Infrastructure: PGlite round-trip（nullability 全パターン）、`meal_plan_id` UNIQUE 違反、
  NOT IN DELETE の挙動
- API 契約: §契約確定仕様 §15 の観点表（`superRefine` 排他検証の契約テストが最重要）

テストランナーは Vitest（全層導入済み）。実行は `pnpm lint` / `pnpm type-check` / `pnpm test`。

---

## リスクと緩和

設計 §リスク（R-1〜R-6）に加え、本実装計画で識別した実装レベルのリスクを併記する。

| #       | リスク                                                        | 影響                                                                 | 緩和                                                                                                                                                    |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 設計R-1 | S-x 未確定のまま着手（対応済み）                              | 手戻り                                                               | 2026-07-12 に S-1〜S-11 全件ユーザー確定済み。本計画はそれを前提に作成                                                                                  |
| 設計R-2 | S-3 案A では targetStore がほぼ null になりがち               | roadmap「価格比較インジケーター」の価値低下                          | 既知の MVP1 制約として受容。Unit B の「店舗未定」グルーピングで受け止める（本ユニット対応不要）                                                         |
| 設計R-3 | Generate の2集約更新が非トランザクション                      | 部分失敗の窓                                                         | S-6-3 の修復分岐（Task 3）+ DB UNIQUE（Task 2）で収束。Task 3 のテストで修復分岐を明示的に検証する                                                      |
| 設計R-4 | 買い物中の save が集約全体書き込み                            | 低速回線での体感悪化の可能性                                         | MVP1 では許容（MealPlan と同型）。Unit B 実測後の改善候補として申し送り（対応不要）                                                                     |
| 設計R-5 | チェック解除（bought→pending）が Unit A に不在                | Unit B の UX 検証で必要と判明する可能性                              | S-11(d) で明示済み。必要時は小さな UseCase 追加で対応可能な構造にしてある（対応不要）                                                                   |
| 設計R-6 | `docs/04-domain-model.md` との乖離放置                        | 後続実装が古い擬似コードを参照                                       | 本計画の「ドキュメント更新対象」で同期タスクを明記（下記）                                                                                              |
| IMP-R1  | IMP-2（PGlite DDL 追記）漏れ                                  | Infrastructure テストが DB エラーで全滅                              | Task 2 の完了条件に明記。テスト実行で即座に検知できる                                                                                                   |
| IMP-R2  | IMP-5（`ProductId` 名前衝突）を誤って両方 import              | TypeScript コンパイルエラー、または誤った型で解決してしまう          | Task 3 のコード例どおり `product/product-id.ts` の `ProductId` のみ import。`recipe-ingredient.ts` 側は構造的型のため明示 import 不要である旨を明記済み |
| IMP-R3  | IMP-4（`created` フラグ）の判定漏れ                           | 契約確定済みの 201/200 分岐が機能しない                              | Task 5 のルートテストで両ケースを明示的に検証                                                                                                           |
| IMP-R4  | `aggregateIngredients` の集計キー実装ミス                     | 材料が誤って合算される／されるべきものが分離される（S-4 の中核価値） | Task 3 の単体テストで境界ケース（同一 displayName 異なる unit／同一 productId 異なる displayName）を明示的にカバー                                      |
| IMP-R5  | `numeric`/`date` カラムの変換漏れ（`Number()`/`'T00:00:00'`） | DTO が文字列型のまま返る／日付が前日にずれる                         | Task 2 のコード例に全箇所明記。DrizzleMealPlanRepository/DrizzleProductRepository の precedent と同一パターンのため実装時に見比べやすい                 |

---

## ロールバック方針

新規テーブル追加のみで既存テーブルへの変更はない（設計 §移行とリリース）。層ごとに独立して
ロールバック可能だが、Infrastructure と Application はテーブル・型の整合が必要なため、原則
Task の逆順（5→4→3→2→1）で戻す。

1. **Presentation（Task 5）**: `routes/shopping-lists.ts`（+テスト）を削除し、`app.ts` の3箇所の
   変更（import・`.route()`・onError 3分岐）を元に戻す
2. **API Contract（Task 4）**: `shopping-list.schema.ts`（+テスト）を削除し、`index.ts` の追記行を
   削除する
3. **Application（Task 3）**: `packages/application/src/shopping-list/` ディレクトリを削除し、
   `application/src/index.ts` の `export * from './shopping-list'` を削除する
4. **Infrastructure（Task 2）**:
   - `schema.ts` から `shoppingLists`/`shoppingItems` 定義を削除する
   - `create-test-db.ts` の DDL から該当 `CREATE TABLE`/`CREATE INDEX` を削除する
   - 生成されたマイグレーションファイル（`apps/web/src/db/migrations/0006_xxxxx.sql` と対応する
     `meta/0006_snapshot.json`）を削除し、`meta/_journal.json` から該当エントリを削除する
   - 本番 DB に適用済みの場合は `DROP TABLE shopping_items; DROP TABLE shopping_lists;`
     （`shopping_items` が `shopping_lists` を参照しているため FK 制約上この順序で DROP する）
   - `drizzle-shopping-list.repository.ts`（+テスト）を削除し、`infrastructure/src/index.ts` の
     export 行を削除する
5. **Domain（Task 1）**: `packages/domain/src/shopping-list/` ディレクトリを削除し、
   `packages/domain/src/shared/quantity.ts` から `add()` を削除する（`quantity.test.ts` の該当
   テストも削除）。他ファイルへの影響はない（`MealPlanId`/`ProductId`/`StoreId` を型参照するのみで
   それらのファイル自体は変更していない）

各層は疎結合（Domain 変更なしで Infrastructure だけロールバック可能、等）だが、既存の
`MealPlan`/`Recipe`/`Product`/`Store` 縦スライスは一切変更していないため、本ユニットの完全撤去は
既存機能に影響しない。

---

## ドキュメント更新対象

L2/L3 のドキュメント方針（`docs/claude-code/document-policy.md`）に基づき、実装完了後に必要な
ドキュメント更新を明記する。**ADR 作成自体はメイン側（Orchestrator/reviewer 工程）が行うため、
本計画では「ADR 候補あり」の記録にとどめる。**

| #   | 対象ドキュメント                             | 更新内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 誰が・いつ                                                                                                                                                                                               |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/04-domain-model.md` §ShoppingList 集約 | (a) `ShoppingItem.requiredAmount` を `Quantity \| null` に修正し `amountNote: string \| null` を追加（S-5。現行の擬似コードは非null前提で矛盾）。(b) `shoppingDate` の意味論を「`mealPlan.weekOf.startDate()`（週開始土曜固定）」に明記（S-10。現行の擬似コードは生成時 `new Date()` を示唆しており乖離）。(c) 擬似コード（`pantryRepo.find()` 呼び出し等）と実装の差異を解消し、Sprint 4 実装が Pantry 依存を持たないこと（S-2）を反映。(d) `getBoughtItemsForPantry()` は **Sprint 4 では未実装**（S-8。型のみ Sprint 5 で確定）である旨の注記を追加 | Task 5（全 Codex タスク）完了後、実装完了後のフォローアップとしてメインエージェント（reviewer 工程）が対応。ADR-0005 の E-8 対応と同じフォローアップ方式（設計 §後方互換性・§リスク R-6 で申し送り済み） |
| 2   | `docs/05-roadmap.md` Sprint 4 タスク表       | Unit A（ShoppingList バックエンド一式: Domain/Infrastructure/Application/API Contract/Presentation）を完了マークに更新。**`GetShoppingListUseCase` + `GET /api/shopping-lists/:id` が S-7 で Unit A に追加されたこと**を Sprint 4 タスク表に反映する（当初計画にない追加スコープのため、roadmap 上でも明示しておかないと Unit B 設計時に見落とされるリスクがある）                                                                                                                                                                                     | 実装完了後（品質ゲート通過後）、メインエージェントが対応                                                                                                                                                 |
| 3   | `docs/designs/shopping-list-core.md`         | ステータスを「draft」→「確定」または「実装済み」に更新する（本設計書冒頭は現在「draft」表記だが、S-1〜S-11 は既に2026-07-12確定済みであるため、実装完了時点で表記を整合させる）                                                                                                                                                                                                                                                                                                                                                                        | 実装完了後、メインエージェントが対応                                                                                                                                                                     |
| —   | ADR 候補（作成は本タスクの対象外）           | 設計 §ADR 候補の3件（S-6: 1MealPlan:最大1ShoppingList の一意性と冪等性／S-4: 材料合算は同一単位完全一致のみ・Quantity.add() 導入／S-3: Product名寄せはproductRef引き継ぎのみ）は恒久決定に昇格する候補として記録されている。ADR 化の要否判断・作成は Orchestrator/reviewer 工程が実装完了後に行う                                                                                                                                                                                                                                                      | 参照のみ。本計画では作成しない                                                                                                                                                                           |

---

## 品質ゲート

全 Task 完了後、ルートで以下を実行しすべて green であること（`.claude/rules/coding-standards.md`
「品質ゲート」節）。

```bash
pnpm lint
pnpm type-check
pnpm test
```

- 新規追加した Vitest ファイル（Domain 3・Infrastructure 1・Application 1・API Contract 1・
  Presentation 1 = 計7ファイル。Domain は ID VO 2 + 集約 1 で実質9ファイル）が全て green
- 既存テスト（Recipe/Product/Store/MealPlan/health 関連）に regression がないこと
- スコープ外変更がないこと（既存 Recipe/Product/Store/MealPlan の Domain・Repository・ルートは
  一切変更しない。D-4 により `findByIds` も追加しない）
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・`import type`
  漏れ・バリデーションエラーメッセージ分岐・無限ループ等。`feedback_codex_review.md` Memory も参照）を
  セルフチェック済みであること
