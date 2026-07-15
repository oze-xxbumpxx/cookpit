# Task 3: Application 層 — Pantry UseCase 3本 + CompleteShoppingUseCase（本ユニットの核）

## 概要

`packages/application/src/pantry/` に DTO / Mapper / エラー 2 種 / UseCase 3 本を新規作成し、
その後 **`CompleteShoppingUseCase`（4 集約またぎ・冪等・部分失敗の自己修復）** を
`packages/application/src/shopping-list/` に作成する（D-1）。**模範コード**:
`packages/application/src/shopping-list/generate-shopping-list.use-case.ts`（複数 Repository の
手動 DI・private helper 分割・冪等ガードの構造）。

依存: Task 1（Domain）。Codex 実行順としては Task 2 完了後を推奨。

## アーキテクチャ制約（必ず遵守）

- 1 ユースケース = 1 クラス・`execute()` のみ。DI は手動（コンストラクタ注入）
- エラーハンドリングは UseCase の入口で行い、内部では例外をそのまま投げる
- 集約をまたぐ操作は Application 層に置く（CompleteShopping が該当）。集約またぎは ID 参照のみ
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==` / 「値なし」は `null`
- 公開 API（UseCase・DTO）の JSDoc は**型に表せない契約情報のみ**（冪等性・`@throws`・保存順序）

## 最重要（先に読むこと）

1. **保存順序厳守: Pantry → Product → ShoppingList → MealPlan**（S-3）。順序を入れ替えると
   自己修復の前提（「ShoppingList 保存 = 冪等ガードのコミットポイント」）が崩れる
2. **価格記録スキップの判定順序**: `requiredAmount === null / value <= 0` の判定を
   **`UnitPriceCalculator.calculate` 呼び出しより前**に置く（順序を誤ると正数チェックが throw し
   完了処理全体が落ちる）
3. **`CompleteShoppingInputDto` は `shopping-list.dto.ts` に追記**（`pantry.dto.ts` に書かない。IMP-4）

## 実装対象ファイル

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
| 14  | 追記 | `packages/application/src/index.ts`                                         | `export * from './pantry'` 追加                                                        |

## 1. Pantry DTO（`pantry.dto.ts`。そのまま実装）

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

`sourceShoppingItemId` は内部の冪等キーであり **DTO に含めない**。

## 2. Mapper（`pantry.mapper.ts`。そのまま実装）

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

## 3. エラークラス 2 種（そのまま実装）

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

## 4. UseCase 3 本（そのまま実装）

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

## 5. `pantry/index.ts`

```typescript
export * from './consume-stock.use-case';
export * from './discard-stock.use-case';
export * from './get-pantry.use-case';
export * from './invalid-stock-operation.error';
export * from './pantry.dto';
export * from './pantry.mapper';
export * from './stock-not-found.error';
```

## 6. `CompleteShoppingInputDto`（`shopping-list.dto.ts` へ追記。IMP-4）

```typescript
export interface CompleteShoppingInputDto {
  shoppingListId: string;
}
```

## 7. `CompleteShoppingUseCase`（`complete-shopping.use-case.ts`。そのまま実装）

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

## 8. `shopping-list/index.ts` / `application/src/index.ts` 追記

```typescript
// shopping-list/index.ts に追記
export * from './complete-shopping.use-case';
```

```typescript
// application/src/index.ts に追記
export * from './pantry';
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- **保存順序 Pantry → Product → ShoppingList → MealPlan を厳守**（入れ替えは契約違反）
- **冪等ガード（`status === 'completed'` 分岐）は `shoppingList.complete()` を呼ぶ前**に置く。
  これにより `InvalidShoppingListStateError` には到達しない（onError の既存 422 分岐は変更不要）
- `now` は `execute()` 冒頭で **1 回だけ**生成し `addStocks`/`recordPrices` に引き回す
- スキップ条件の判定順序: 条件2（amount <= 0）→ 条件3（requiredAmount null/<=0）→
  `UnitPriceCalculator.calculate` → 条件4（丸め 0）。**条件3を calculate より後にしない**
- `recordPrices` は productId ごとに findById 1 回・**常に save 1 回**（IMP-6。記録 0 件でも save）
- エラークラスの `name` 設定（`this.name = '...'`）を忘れない（既存エラークラスと同構造）
- 識別子の綴り: `ConsumeStockUseCase` / `DiscardStockUseCase` / `GetPantryUseCase` /
  `CompleteShoppingUseCase` / `StockNotFoundError` / `InvalidStockOperationError` /
  `toStockDto` / `toPantryDto`

## テスト

**`pantry-use-cases.test.ts`**（`InMemoryPantryRepository` をファイル内に新設）:

- `ConsumeStockUseCase`: 単位一致で消費反映／未検出 stockId で `StockNotFoundError`／
  単位不一致で `InvalidStockOperationError`（メッセージに expected/got 双方を含む）／
  全量消費で対象 Stock が `PantryDto.stocks` から消える（D-3 の更新後 DTO 返却を確認）
- `DiscardStockUseCase`: 対象が消える／未検出で `StockNotFoundError`／残量があっても全量削除
- `GetPantryUseCase`: 空 Pantry で `{ stocks: [] }`（例外を投げない）／複数 Stock 全件返す

**`complete-shopping.use-case.test.ts`**（IMP-5・独立ファイル。
`InMemoryShoppingListRepository`/`InMemoryPantryRepository`/`InMemoryProductRepository`/
`InMemoryMealPlanRepository` の 4 種をこのファイル内にローカル定義する。他テストファイルから
import しない）:

- **冪等再実行**: completed の ShoppingList への再実行で Pantry/Product の `save` 回数が増えない
  （スパイで確認）／戻り値 `ShoppingListDto` が変化しない
- **部分失敗の修復 (i)**: Stock 追加済み + `active` から再実行 → `hasStockFromShoppingItem` で
  二重追加なし・後続段は通常実行
- **部分失敗の修復 (ii)**: completed + MealPlan が `shopping` のまま → MealPlan が `cooking` へ
  遷移し save される
- **部分失敗の修復 (iii)**: MealPlan が `draft` のまま → `draft → shopping → cooking` の
  二段遷移で修復
- bought 0 件の完了: Pantry/Product への副作用なし・`complete()` + MealPlan 遷移のみ
- **価格記録スキップ 5 種（S-9）**: `productId === null`／`actualPrice.amount === 0`（S-8）／
  `requiredAmount === null`／`requiredAmount.value === 0`／calculate 丸め 0（超安価×大容量。
  例: actualPrice 1 円 × requiredAmount 10000 個）。各ケースで **Stock 追加は行われるが
  `recordPrice` は呼ばれない**ことを確認
- `requiredAmount === null` 品目の Stock 化（S-6）: `Quantity.of(1, '個')` で `addStock` に渡る
- 同一 Product 複数 bought 品目（D-5）: `findById`/`save` が各 1 回のみ（スパイで確認）
- MealPlan 不存在（D-4）: findById が null でも完了処理全体は成功
- `ShoppingListNotFoundError`: 存在しない shoppingListId で throw

## 完了条件

- [ ] `pnpm --filter @cookpit/application test` 全 green
- [ ] `pnpm --filter @cookpit/application type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] Pantry 3 UseCase・`CompleteShoppingUseCase` が全て実装されている
- [ ] S-3 冪等・3 種の部分失敗修復・S-9 スキップ 5 種・D-4 遷移分岐・D-5 グルーピングが
      テストで担保されている
- [ ] `application/src/index.ts` に `export * from './pantry'` が追加されている
