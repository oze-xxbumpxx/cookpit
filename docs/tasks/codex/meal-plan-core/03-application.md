# Task 3: Application 層 — DTO・Mapper・エラー・UseCase の実装

## 概要

MealPlan の UseCase 5本と関連 DTO/Mapper/エラークラスを実装する。既存の Product UseCase
（`packages/application/src/product/`）と同じパターンに従う。**Task 1（Domain）完了が前提**
（Task 2 の Repository はモックで代替するため、このタスク単体でも実装可能）。

## アーキテクチャ制約

- UseCase は 1 ユースケース = 1 クラス・`execute()` メソッドのみ。DI は手動 DI（コンストラクタ注入）
- エラーハンドリングは UseCase の入口（ドメイン境界）で行う
- Entity を UseCase の境界外へ漏らさない（`MealPlanDto`/`PlannedRecipeDto` を使う）
- `any` 禁止、型のみは `import type`、値なしは `null`
- **Domain 層は単純な `Error` を throw する方針**（Task 1 参照）。本タスクの UseCase が
  `try/catch` して `MealPlanNotFoundError`/`InvalidMealPlanStateError`/`PlannedRecipeNotFoundError` に
  変換する責務を持つ

## 実装対象ファイル

すべて `packages/application/src/meal-plan/` 配下に新規作成する。

### 1. `meal-plan.dto.ts`

```typescript
export type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';

export interface PlannedRecipeDto {
  id: string;
  recipeId: string;
  scaleFactor: number;
  scheduledDate: string | null; // ISO date "2026-07-06" | null
  cookedAt: string | null; // ISO 8601 datetime | null
  notes: string;
}

export interface MealPlanDto {
  id: string;
  weekIdentifier: string; // "2026-07-04"（WeekIdentifier.toString()）
  status: MealPlanStatus;
  plannedRecipes: PlannedRecipeDto[];
  createdAt: string; // ISO 8601 datetime
  completedAt: string | null;
}

export interface CreateMealPlanInputDto {
  weekIdentifier: string;
}

export interface AddRecipeToMealPlanInputDto {
  mealPlanId: string;
  recipeId: string;
  scaleFactor: number;
}

export interface RemoveRecipeFromMealPlanInputDto {
  mealPlanId: string;
  plannedRecipeId: string;
}

export interface GetMealPlanHistoryInputDto {
  limit?: number; // デフォルト4、最大12
}
```

### 2. `meal-plan.mapper.ts`

```typescript
export function toMealPlanDto(mealPlan: MealPlan): MealPlanDto {
  // weekIdentifier: mealPlan.weekOf.toString()
  // plannedRecipes: mealPlan.plannedRecipes.map(toPlannedRecipeDto)
  // createdAt: mealPlan.createdAt.toISOString()
  // completedAt: mealPlan.completedAt?.toISOString() ?? null
}

export function toPlannedRecipeDto(plannedRecipe: PlannedRecipe): PlannedRecipeDto {
  // scheduledDate: plannedRecipe.scheduledDate ? plannedRecipe.scheduledDate.toISOString().slice(0, 10) : null
  // cookedAt: plannedRecipe.cookedAt?.toISOString() ?? null
}
```

**注意**: この `scheduledDate` の `toISOString().slice(0,10)` は DTO 出力専用の変換であり、
Task 1 の `WeekIdentifier.toString()`（ローカル日付ベース、`toISOString()` 不使用）とは別の関心事。
混同しないこと（`PlannedRecipe.scheduledDate` は補助的な日付表示のため既存コードの慣習に従う）。

### 3. エラークラス3本

`ProductNotFoundError`（`packages/application/src/product/product-not-found.error.ts`）と完全に同一パターン。

```typescript
// meal-plan-not-found.error.ts
export class MealPlanNotFoundError extends Error {
  constructor(mealPlanId: string) {
    super(`MealPlan not found: ${mealPlanId}`);
    this.name = 'MealPlanNotFoundError';
  }
}

// planned-recipe-not-found.error.ts
export class PlannedRecipeNotFoundError extends Error {
  constructor(plannedRecipeId: string) {
    super(`PlannedRecipe not found: ${plannedRecipeId}`);
    this.name = 'PlannedRecipeNotFoundError';
  }
}

// invalid-meal-plan-state.error.ts
export class InvalidMealPlanStateError extends Error {
  constructor(current: MealPlanStatus, operation: string) {
    super(`Cannot ${operation} a MealPlan with status '${current}'`);
    this.name = 'InvalidMealPlanStateError';
  }
}
```

### 4. UseCase 5本

各 UseCase は `MealPlanRepository` のみをコンストラクタで受け取る（`RecipeRepository` は注入しない）。

#### `create-meal-plan.use-case.ts`（C-3: 冪等）

```typescript
export class CreateMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: CreateMealPlanInputDto): Promise<MealPlanDto> {
    const weekIdentifier = WeekIdentifier.fromString(input.weekIdentifier);
    const existing = await this.mealPlanRepository.findByWeek(weekIdentifier);
    if (existing !== null) {
      return toMealPlanDto(existing); // 冪等: ステータスに関わらず既存を返す
    }
    const mealPlan = MealPlan.create(weekIdentifier);
    await this.mealPlanRepository.save(mealPlan);
    return toMealPlanDto(mealPlan);
  }
}
```

#### `add-recipe-to-meal-plan.use-case.ts`

```typescript
export class AddRecipeToMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: AddRecipeToMealPlanInputDto): Promise<PlannedRecipeDto> {
    const mealPlan = await this.mealPlanRepository.findById(
      MealPlanId.fromString(input.mealPlanId),
    );
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(input.mealPlanId);
    }
    let plannedRecipeId: PlannedRecipeId;
    try {
      plannedRecipeId = mealPlan.addRecipe(RecipeId.fromString(input.recipeId), input.scaleFactor);
    } catch (error) {
      // Domain の単純 Error を InvalidMealPlanStateError に変換
      // (status ガード違反時のみここに到達する。scaleFactor<=0 は PlannedRecipe.create 内部の Error だが
      //  Hono の Zod バリデーションで通常は到達しない。到達した場合もこの catch で拾われる点に注意し、
      //  status 起因のエラーと scaleFactor 起因のエラーを区別する必要があれば Domain 側のエラーメッセージで判別する)
      throw new InvalidMealPlanStateError(mealPlan.status, 'addRecipe');
    }
    await this.mealPlanRepository.save(mealPlan);
    const planned = mealPlan.plannedRecipes.find((p) => p.id.equals(plannedRecipeId));
    return toPlannedRecipeDto(planned!);
  }
}
```

#### `remove-recipe-from-meal-plan.use-case.ts`

```typescript
export class RemoveRecipeFromMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: RemoveRecipeFromMealPlanInputDto): Promise<void> {
    const mealPlan = await this.mealPlanRepository.findById(
      MealPlanId.fromString(input.mealPlanId),
    );
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(input.mealPlanId);
    }
    // status ガード違反と「PlannedRecipe が見つからない」の両方を Domain が単純 Error で throw するため、
    // このユースケースは両ケースを区別して変換する必要がある。
    // 実装方針: mealPlan.plannedRecipes に対象 plannedRecipeId が存在するかを先に確認してから
    // removeRecipe を呼ぶことで、区別可能にする（下記シーケンス参照）。
    const plannedRecipeId = PlannedRecipeId.fromString(input.plannedRecipeId);
    const exists = mealPlan.plannedRecipes.some((p) => p.id.equals(plannedRecipeId));
    if (!exists) {
      throw new PlannedRecipeNotFoundError(input.plannedRecipeId);
    }
    try {
      mealPlan.removeRecipe(plannedRecipeId);
    } catch {
      throw new InvalidMealPlanStateError(mealPlan.status, 'removeRecipe');
    }
    await this.mealPlanRepository.save(mealPlan);
  }
}
```

**重要**: 上記の「存在確認を先に行ってから `removeRecipe` を呼ぶ」方式は、Domain が単純 `Error` を
投げる方針（Task 1）でも `MealPlanNotFoundError`/`PlannedRecipeNotFoundError`/`InvalidMealPlanStateError`
を正しく判別するための実装方針。メッセージ文字列マッチによる判別は壊れやすいため使わないこと。

#### `get-current-meal-plan.use-case.ts`

```typescript
export class GetCurrentMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(asOf?: Date): Promise<MealPlanDto | null> {
    const weekIdentifier = WeekIdentifier.fromDate(asOf ?? new Date());
    const mealPlan = await this.mealPlanRepository.findByWeek(weekIdentifier);
    return mealPlan === null ? null : toMealPlanDto(mealPlan);
  }
}
```

`asOf` は単体テストでの現在日時制御用（Hono ルートからは引数なしで呼ぶ）。

#### `get-meal-plan-history.use-case.ts`

```typescript
export class GetMealPlanHistoryUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: GetMealPlanHistoryInputDto): Promise<MealPlanDto[]> {
    const limit = input.limit ?? 4;
    const mealPlans = await this.mealPlanRepository.findRecent(limit);
    return mealPlans.map(toMealPlanDto);
  }
}
```

### 5. `index.ts`（バレルエクスポート）

```typescript
export * from './create-meal-plan.use-case';
export * from './add-recipe-to-meal-plan.use-case';
export * from './remove-recipe-from-meal-plan.use-case';
export * from './get-current-meal-plan.use-case';
export * from './get-meal-plan-history.use-case';
export * from './meal-plan.dto';
export * from './meal-plan.mapper';
export * from './meal-plan-not-found.error';
export * from './planned-recipe-not-found.error';
export * from './invalid-meal-plan-state.error';
```

### 6. `packages/application/src/index.ts`（既存ファイルへの追記）

```typescript
export * from './meal-plan';
```

## 命名・記法の注意

- 5 UseCase 全て `MealPlanRepository` のみをコンストラクタで受け取る（`RecipeRepository` を追加 DI しない。D-7）
- エラークラスのファイル名は kebab-case（`meal-plan-not-found.error.ts` 等）、既存 `product-not-found.error.ts` と同じ命名規則

## テスト

### `meal-plan-use-cases.test.ts`

`packages/application/src/product/product-use-cases.test.ts` の `InMemoryProductRepository` パターンを
踏襲した `InMemoryMealPlanRepository`（`findById`/`findByWeek`/`findRecent`/`save` を実装し、
`saveCount` で副作用を観測、`seed()` でテストデータ投入）を実装する。

- `CreateMealPlanUseCase`: 新規作成で `status: 'draft'`・`plannedRecipes: []`・`saveCount: 1`。
  **同一週で2回目を実行しても `saveCount` が `1` のまま**（新規 `save` が発生しない = 冪等性の核心テスト）。
  既存の status が `cooking`（draft 以外）でも冪等でそのまま返る
- `AddRecipeToMealPlanUseCase`: draft/shopping で成功、`scaleFactor` が保持される。
  存在しない `mealPlanId` で `MealPlanNotFoundError`。status が cooking/consuming/completed で
  `InvalidMealPlanStateError`（`save` は呼ばれない）
- `RemoveRecipeFromMealPlanUseCase`: 成功時に該当 PlannedRecipe が消える。`mealPlanId` 不存在で
  `MealPlanNotFoundError`。MealPlan は存在するが `plannedRecipeId` が不一致で
  `PlannedRecipeNotFoundError`。status が cooking 以降で `InvalidMealPlanStateError`
- `GetCurrentMealPlanUseCase`: `asOf` 引数を使って `vi.setSystemTime()` に頼らず決定的にテストする。
  対象週に MealPlan があれば DTO、なければ `null`
- `GetMealPlanHistoryUseCase`: 複数週 seed して `limit` 件が新しい順で返る。実件数が `limit` 未満でも
  エラーなし。空なら `[]`。`limit` 未指定時はデフォルト `4` が適用される

## 完了条件

```bash
pnpm --filter @cookpit/application test        # 全 green
pnpm --filter @cookpit/application type-check  # 通過
pnpm lint
```

- 5 UseCase 全てが実装され、`InvalidMealPlanStateError`/`PlannedRecipeNotFoundError`/`MealPlanNotFoundError`
  が要件通り正しく投げ分けられる
- `CreateMealPlanUseCase` の冪等性テストが green（`saveCount` が2回目実行後も増加しない）
