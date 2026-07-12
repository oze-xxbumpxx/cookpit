# Task 3: Application 層 — DTO / Mapper / エラー 3 種 / UseCase 5 本

## 概要

`packages/application/src/shopping-list/` を新規作成し、DTO・Mapper・エラークラス 3 種・
UseCase 5 本（Generate / AddItem / MarkAsBought / ReassignStore / GetShoppingList）+
InMemory Repository テストを実装する。
**模範コード（必ず開いてパターンを踏襲すること）**:

- `packages/application/src/meal-plan/` 一式 — UseCase / DTO / Mapper / エラーの構成
- `packages/application/src/meal-plan/meal-plan-use-cases.test.ts` — InMemory Repository テスト形式

依存: Task 1（Domain）。Task 2 の完了を待たなくても型検査は通る（Repository 実装の配線は Task 5）。

## アーキテクチャ制約（必ず遵守）

- 1 ユースケース = 1 クラス・`execute()` メソッドのみ。DI は手動 DI（コンストラクタ注入）
- UseCase の戻り値は **DTO**（Domain Entity を境界外に漏らさない）
- エラーハンドリングはドメイン境界（UseCase の入口）。内部では例外をそのまま投げる
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==` / 「値なし」は `null`

## 実装対象ファイル（すべて `packages/application/src/shopping-list/` 新規 + 既存 index.ts 追記）

| #   | ファイル                                          | 内容                                    |
| --- | ------------------------------------------------- | --------------------------------------- |
| 1   | `shopping-list.dto.ts`                            | DTO 群                                  |
| 2   | `shopping-list.mapper.ts`                         | `toShoppingListDto`/`toShoppingItemDto` |
| 3   | `shopping-list-not-found.error.ts`                | `ShoppingListNotFoundError`             |
| 4   | `shopping-item-not-found.error.ts`                | `ShoppingItemNotFoundError`             |
| 5   | `invalid-shopping-list-state.error.ts`            | `InvalidShoppingListStateError`         |
| 6   | `generate-shopping-list.use-case.ts`              | `GenerateShoppingListUseCase`           |
| 7   | `add-item.use-case.ts`                            | `AddItemUseCase`                        |
| 8   | `mark-as-bought.use-case.ts`                      | `MarkAsBoughtUseCase`                   |
| 9   | `reassign-store.use-case.ts`                      | `ReassignStoreUseCase`                  |
| 10  | `get-shopping-list.use-case.ts`                   | `GetShoppingListUseCase`（S-7）         |
| 11  | `index.ts`                                        | バレルエクスポート                      |
| 12  | `shopping-list-use-cases.test.ts`                 | 5 UseCase の InMemory Repository テスト |
| —   | `packages/application/src/index.ts`（既存・追記） | `export * from './shopping-list'`       |

## 1. DTO（`shopping-list.dto.ts`）

`unit` は `string` ではなく **`Unit` 型**（既存 `product.dto.ts` の先例に統一）。
`GenerateShoppingListResultDto` は 201/200 分岐をルート層に伝えるためのラッパー。

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

## 2. Mapper（`shopping-list.mapper.ts`）

**重要**: `shoppingDate` はローカル日付整形。**`toISOString().slice(0, 10)` は禁止**
（JST で前日にずれる）。

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

既存 `meal-plan.mapper.ts` の `toPlannedRecipeDto` に同種の潜在バグがあるが、
**スコープ外のため修正しない**（触らない）。

## 3. エラークラス 3 種

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

Generate で MealPlan が draft でない場合は**新規クラスを作らず**、既存
`InvalidMealPlanStateError`（`../meal-plan/invalid-meal-plan-state.error`）を
`new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from')` の形で流用する。

## 4. `GenerateShoppingListUseCase`（最重要・S-2/S-3/S-4/S-6/S-10/D-1/D-4/D-7/D-8）

依存 Repository は 4 種のみ: `MealPlanRepository`・`RecipeRepository`・`ProductRepository`・
`ShoppingListRepository`（**`PantryRepository` は注入しない**（S-2）。`StoreRepository` も不要）。

**名前衝突に注意（厳守)**: `ProductId` は `product/product-id.ts` のクラス**のみ**を名前付き
インポートする。`recipe-ingredient.ts` にも同名のローカル型 `ProductId` があるが**明示インポート
しない**（`ingredient.productRef?.value` でアクセスすれば型推論で足りる）。

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

実装要点:

- private 3 メソッド（`resolveRecipes`/`aggregateIngredients`/`resolveTargetStores`）への分割を維持
  （将来 S-3 案 C 移行時の変更を局所化するため）
- `requiredAmount`/`amountNote` の排他検証は Domain（Task 1）が担うため二重チェックしない
- 空 `plannedRecipes`（D-7）は特別分岐不要（空配列がそのまま流れ `items: []` で生成される）

## 5. `AddItemUseCase`

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
      amountNote: null, // Unit A の AddItem は amountNote 付き追加を受け付けない（契約確定仕様）
      targetStore: input.targetStoreId ? StoreId.fromString(input.targetStoreId) : null,
      source: 'manually_added',
    });

    shoppingList.addItem(item);
    await this.shoppingListRepository.save(shoppingList);

    return toShoppingItemDto(item);
  }
}
```

## 6. `MarkAsBoughtUseCase` / `ReassignStoreUseCase`

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

`ReassignStoreUseCase` は同型: `shoppingList.reassignStore(itemId, StoreId.fromString(input.targetStoreId))`
に置き換え、operation 文字列は `'reassignStore'`、入力は `ReassignStoreInputDto`。

## 7. `GetShoppingListUseCase`（S-7）

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

## 8. バレルエクスポート

`shopping-list/index.ts`:

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

`packages/application/src/index.ts`（既存に 1 行追記）:

```typescript
export * from './shopping-list';
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- エラークラス名の綴り: `InvalidShoppingListStateError`（`Invaild` にしない）。`this.name = ...` の
  文字列もクラス名と完全一致させる
- `GenerateShoppingListUseCase` のコンストラクタ引数順: `mealPlanRepository` →
  `recipeRepository` → `productRepository` → `shoppingListRepository`（4 種のみ。
  **PantryRepository を足さない**）
- 他の 4 UseCase は `shoppingListRepository` のみを受け取る
- 集計キーは `` `${productId.value ?? displayName.trim()}|${unit}` `` 形式。誤ると S-4 の合算が
  壊れる（同一 displayName・異単位を合算してしまう等）
- `Quantity`/`Money`/各 ID はランタイム使用（`fromString`/`of`）のため通常 import、
  Repository IF・DTO・`Recipe`/`PlannedRecipe` 型は `import type`

## テスト（`shopping-list-use-cases.test.ts`。InMemory Repository を自前実装・1 ファイル）

- **Generate**: 正常生成（複数レシピ・合算あり）／存在しない mealPlanId で `MealPlanNotFoundError`／
  draft 以外 + 既存リストなしで `InvalidMealPlanStateError`／**冪等再実行**（2 回目は既存を返し
  `created: false`、`save` 呼び出し回数が増えない）／**部分失敗の自己修復**（既存リストあり +
  `status === 'draft'` なら `transitionTo` + `save` が実行される）／既存リストあり + `cooking` は
  遷移せず既存を返す／削除済み Recipe はスキップされ他の材料は生成される（D-8）／空
  `plannedRecipes` で `items: []` 生成（D-7）／**集計キー境界**: 同一 `productId`・同一単位は合算、
  同一 `displayName` でも単位が異なれば別行、`amount=null`（適量材料）は個別行のまま／
  `scaleFactor` 小数（例 1.5）での数量精度／`productId` なし・価格履歴なしは `targetStoreId: null`（D-1）
- **AddItem**: 正常追加（`source: 'manually_added'`）／`productId`/`targetStoreId` 指定・未指定の
  組み合わせ／存在しない `shoppingListId` で `ShoppingListNotFoundError`／completed への追加で
  `InvalidShoppingListStateError`
- **MarkAsBought**: 正常マーク（`actualPrice`/`actualStoreId` 記録）／存在しない
  `shoppingListId`/`itemId` でそれぞれの NotFound エラー／completed で
  `InvalidShoppingListStateError`／bought への再適用（上書き・S-11a）／skipped への適用（S-11b）
- **ReassignStore**: 正常変更／bought の item で `targetStoreId` のみ変わり `actualPrice`/
  `actualStoreId` 不変（S-11c）／存在しない `itemId`
- **GetShoppingList**: 正常取得／存在しない `shoppingListId` で `ShoppingListNotFoundError`

## 完了条件

- [ ] `pnpm --filter @cookpit/application test` 全 green
- [ ] `pnpm --filter @cookpit/application type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] 5 UseCase すべて実装され、コンストラクタ注入が設計どおり最小限
      （Generate のみ 4 種、他は `ShoppingListRepository` のみ）
- [ ] Generate が冪等（既存リストがあれば `save` を呼ばずに返す）
- [ ] `InvalidShoppingListStateError`/`ShoppingListNotFoundError`/`ShoppingItemNotFoundError` が
      適切に投げ分けられる
