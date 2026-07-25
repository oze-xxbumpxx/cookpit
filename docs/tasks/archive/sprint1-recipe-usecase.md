# Sprint 1：Recipe UseCase 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`docs/tasks/archive/sprint1-drizzle-recipe-repository.md` の作業が完了していること（`DrizzleRecipeRepository` がレビュー済み）。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Application 層の責務・依存方向・サーバーサイドの呼び出し方）
- `docs/04-domain-model.md`（Recipe 集約の構造）
- `docs/07-dev-rules.md`（コーディング規約）

また、以下の実装済みファイルを必ず読んでから実装すること。getter 名・フィールド名・ファクトリ名を確認し、推測で命名しないこと。

- `packages/domain/src/recipe/recipe.ts`（`Recipe.create()` / `reconstruct()` / 各更新メソッド・getter）
- `packages/domain/src/recipe/recipe-ingredient.ts`（`RecipeIngredient.create()` / `ProductId`）
- `packages/domain/src/recipe/recipe-id.ts`（`RecipeId.fromString()` / `value`）
- `packages/domain/src/recipe/cooking-step.ts`（`CookingStep`）
- `packages/domain/src/recipe/recipe.repository.ts`（`RecipeRepository` インターフェース）
- `packages/domain/src/shared/quantity.ts`（`Quantity.of()`）
- `packages/domain/src/shared/unit.ts`（`Unit` 型）
- `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`（**インポートパスの書き方をこのファイルに合わせる**）

---

## タスク概要

`packages/application` に Recipe の CRUD ユースケースを実装する。

各 UseCase は手動 DI（コンストラクタで `RecipeRepository` を受け取る）とし、`execute()` メソッドのみを公開する。入出力は**プレーンな DTO** とし、Recipe エンティティを Application 層の外（Presentation / Hono）へ漏らさない。

```
Presentation → Application(UseCase) → Domain ← Infrastructure
```

UseCase はドメインモデルを「組み立てて操作し、保存する」役割に徹する。バリデーション・状態遷移などのドメインロジックは Entity / Value Object 側に既に閉じ込められているため、UseCase で再実装しない。

---

## 作成・変更するファイル一覧

```
新規作成
packages/application/src/recipe/recipe.dto.ts
packages/application/src/recipe/recipe.mapper.ts
packages/application/src/recipe/recipe-not-found.error.ts
packages/application/src/recipe/create-recipe.use-case.ts
packages/application/src/recipe/get-recipes.use-case.ts
packages/application/src/recipe/get-recipe.use-case.ts
packages/application/src/recipe/update-recipe.use-case.ts
packages/application/src/recipe/delete-recipe.use-case.ts

更新
packages/application/src/index.ts
packages/application/package.json   # @cookpit/domain を依存に追加
```

> `get-recipe.use-case.ts`（単体取得）は `docs/03-architecture.md` の一覧（create / get-recipes / update / delete）に対する追加。詳細画面 `/recipes/[id]` が ID 指定の単体取得を必要とするため含める。

---

## ステップ 0：`package.json` に依存を追加

`packages/application/package.json` に `@cookpit/domain` を追加する。現状 `dependencies` が無いので新設する。

```json
{
  "name": "@cookpit/application",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@cookpit/domain": "workspace:*"
  },
  "devDependencies": {
    "@cookpit/config": "workspace:*",
    "typescript": "^5.8.3"
  }
}
```

追加後に `pnpm install` を実行して workspace リンクを張ること。

### インポートパスについて

`@cookpit/domain` の `main` は `./src/index.ts` だが、現時点で `domain/src/index.ts` はほぼ空のため、個別ファイルへ subpath import する。**`drizzle-recipe.repository.ts` と同じ書き方に揃えること**（実績のあるパス）。

```typescript
import { Recipe, type RecipeTag } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { RecipeIngredient } from '@cookpit/domain/src/recipe/recipe-ingredient';
import { CookingStep } from '@cookpit/domain/src/recipe/cooking-step';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { Unit } from '@cookpit/domain/src/shared/unit';
```

---

## ステップ 1：`recipe.dto.ts`（入出力 DTO）

プレーンなオブジェクト型のみを定義する。クラスやロジックは置かない。
`Unit` / `RecipeTag` は文字列リテラル Union なので、型の境界としてそのまま使う（HTTP の raw 文字列 → これらの型への検証は後続の api-contract / Zod 層が担当する）。

材料・手順の DTO は入力・出力で同形のため共用する。Recipe レベルのみ Create / Update / 出力を分ける。

```typescript
import type { Unit } from '@cookpit/domain/src/shared/unit';
import type { RecipeTag } from '@cookpit/domain/src/recipe/recipe';

export interface RecipeIngredientDto {
  productRef: string | null;
  displayName: string;
  amountValue: number | null;
  amountUnit: Unit | null;
  amountNote: string | null;
}

export interface CookingStepDto {
  description: string;
}

export interface RecipeDto {
  id: string;
  name: string;
  baseServings: number;
  cookingTime: number | null;
  tags: RecipeTag[];
  notes: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateRecipeInputDto {
  name: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  baseServings: number;
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
}

export interface UpdateRecipeInputDto {
  id: string;
  name: string;
  ingredients: RecipeIngredientDto[];
  steps: CookingStepDto[];
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
}
```

### 設計のポイント

- `createdAt` / `updatedAt` は DTO では `string`（ISO 8601）にする。HTTP/JSON でシリアライズ可能にし、`Date` を境界外に漏らさないため。
- `UpdateRecipeInputDto` には **`baseServings` を含めない**（理由は「注意事項」参照）。

---

## ステップ 2：`recipe.mapper.ts`（DTO ↔ ドメイン変換）

入力 DTO → ドメインオブジェクト、ドメイン → 出力 DTO の双方向変換をまとめる。
ドメインの復元は必ずファクトリ（`RecipeIngredient.create()` / `Quantity.of()` / `new CookingStep()`）を経由する。

```typescript
import { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeIngredient } from '@cookpit/domain/src/recipe/recipe-ingredient';
import { CookingStep } from '@cookpit/domain/src/recipe/cooking-step';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { Unit } from '@cookpit/domain/src/shared/unit';
import type { RecipeDto, RecipeIngredientDto, CookingStepDto } from './recipe.dto';

function toQuantity(value: number | null, unit: Unit | null): Quantity | null {
  if (value === null || unit === null) {
    return null;
  }
  return Quantity.of(value, unit);
}

export function toIngredient(dto: RecipeIngredientDto): RecipeIngredient {
  return RecipeIngredient.create({
    productRef: dto.productRef !== null ? { value: dto.productRef } : null,
    displayName: dto.displayName,
    amount: toQuantity(dto.amountValue, dto.amountUnit),
    amountNote: dto.amountNote,
  });
}

export function toStep(dto: CookingStepDto): CookingStep {
  return new CookingStep(dto.description);
}

export function toRecipeDto(recipe: Recipe): RecipeDto {
  return {
    id: recipe.id.value,
    name: recipe.name,
    baseServings: recipe.baseServings,
    cookingTime: recipe.cookingTime,
    tags: recipe.tags,
    notes: recipe.notes,
    ingredients: recipe.ingredients.map(toIngredientDto),
    steps: recipe.steps.map(toStepDto),
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

function toIngredientDto(ing: RecipeIngredient): RecipeIngredientDto {
  return {
    productRef: ing.productRef?.value ?? null,
    displayName: ing.displayName,
    amountValue: ing.amount?.value ?? null,
    amountUnit: ing.amount?.unit ?? null,
    amountNote: ing.amountNote,
  };
}

function toStepDto(step: CookingStep): CookingStepDto {
  return { description: step.description };
}
```

---

## ステップ 3：`recipe-not-found.error.ts`

ID 指定で対象が見つからない場合に投げる専用エラー。後続の Hono 層で 404 にマッピングしやすくするため、汎用 `Error` ではなく専用クラスにする。

```typescript
export class RecipeNotFoundError extends Error {
  constructor(recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'RecipeNotFoundError';
  }
}
```

---

## ステップ 4：UseCase 実装

すべて「1 ユースケース = 1 クラス・`execute()` のみ公開」「コンストラクタで `RecipeRepository` を手動 DI」の形にする。

### `create-recipe.use-case.ts`

```typescript
import { Recipe } from '@cookpit/domain/src/recipe/recipe';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { CreateRecipeInputDto, RecipeDto } from './recipe.dto';
import { toIngredient, toStep, toRecipeDto } from './recipe.mapper';

export class CreateRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(input: CreateRecipeInputDto): Promise<RecipeDto> {
    const recipe = Recipe.create({
      name: input.name,
      ingredients: input.ingredients.map(toIngredient),
      steps: input.steps.map(toStep),
      baseServings: input.baseServings,
      tags: input.tags,
      cookingTime: input.cookingTime,
      notes: input.notes,
    });

    await this.recipeRepository.save(recipe);

    return toRecipeDto(recipe);
  }
}
```

### `get-recipes.use-case.ts`（一覧）

```typescript
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { RecipeDto } from './recipe.dto';
import { toRecipeDto } from './recipe.mapper';

export class GetRecipesUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(): Promise<RecipeDto[]> {
    const recipes = await this.recipeRepository.findAll();
    return recipes.map(toRecipeDto);
  }
}
```

### `get-recipe.use-case.ts`（単体）

```typescript
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { RecipeDto } from './recipe.dto';
import { toRecipeDto } from './recipe.mapper';
import { RecipeNotFoundError } from './recipe-not-found.error';

export class GetRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(id: string): Promise<RecipeDto> {
    const recipe = await this.recipeRepository.findById(RecipeId.fromString(id));
    if (recipe === null) {
      throw new RecipeNotFoundError(id);
    }
    return toRecipeDto(recipe);
  }
}
```

### `update-recipe.use-case.ts`

既存の Recipe を取得し、ドメインの更新メソッドを使って変更してから保存する。

```typescript
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { UpdateRecipeInputDto, RecipeDto } from './recipe.dto';
import { toIngredient, toStep, toRecipeDto } from './recipe.mapper';
import { RecipeNotFoundError } from './recipe-not-found.error';

export class UpdateRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(input: UpdateRecipeInputDto): Promise<RecipeDto> {
    const recipe = await this.recipeRepository.findById(RecipeId.fromString(input.id));
    if (recipe === null) {
      throw new RecipeNotFoundError(input.id);
    }

    recipe.rename(input.name);
    recipe.updateIngredients(input.ingredients.map(toIngredient));
    recipe.updateSteps(input.steps.map(toStep));
    recipe.updateTags(input.tags);
    recipe.updateCookingTime(input.cookingTime);
    recipe.updateNotes(input.notes);

    await this.recipeRepository.save(recipe);

    return toRecipeDto(recipe);
  }
}
```

### `delete-recipe.use-case.ts`

存在確認してから削除する（見つからなければ `RecipeNotFoundError`）。

```typescript
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { RecipeNotFoundError } from './recipe-not-found.error';

export class DeleteRecipeUseCase {
  constructor(private readonly recipeRepository: RecipeRepository) {}

  async execute(id: string): Promise<void> {
    const recipeId = RecipeId.fromString(id);

    const recipe = await this.recipeRepository.findById(recipeId);
    if (recipe === null) {
      throw new RecipeNotFoundError(id);
    }

    await this.recipeRepository.delete(recipeId);
  }
}
```

---

## ステップ 5：`index.ts` を更新

```typescript
export * from './recipe/recipe.dto';
export * from './recipe/recipe-not-found.error';
export * from './recipe/create-recipe.use-case';
export * from './recipe/get-recipes.use-case';
export * from './recipe/get-recipe.use-case';
export * from './recipe/update-recipe.use-case';
export * from './recipe/delete-recipe.use-case';
```

> `recipe.mapper.ts` は Application 層内部の変換専用のため export しない。

---

## 型チェック

実装後に以下を実行してエラーがないことを確認する。

```bash
pnpm --filter @cookpit/application type-check
```

---

## 共通の注意事項

- `any` 型は禁止。型アサーション（`as`）は使わない（DTO は domain の型を直接使うため不要なはず）。
- デフォルトエクスポートは禁止。名前付きエクスポートのみ。
- `null` と `undefined` を混在させない（「値なし」は `null` に統一）。
- コンストラクタは `private readonly` を明示する（`readonly` のみにしない）。
- `map` のコールバック引数は単数形の短縮名（`ing`、`step`）を使い、外側の変数名をシャドウイングしない。
- コメントは「なぜ（Why）」が非自明な場合のみ書く。
- UseCase 内でドメインのバリデーションを再実装しない。エラーは Entity / Value Object のファクトリがそのまま投げる（`RecipeNotFoundError` のみ UseCase の責務）。

### baseServings は Update で変更しない（重要）

現在の `Recipe` エンティティには `baseServings` を更新するメソッドが存在しない（`rename` / `updateIngredients` / `updateSteps` / `updateTags` / `updateCookingTime` / `updateNotes` のみ）。
そのため `UpdateRecipeInputDto` には `baseServings` を含めず、更新もしない。

編集画面で `baseServings` の変更が必要になった場合は、`Recipe` に `updateBaseServings()` を追加する**ドメイン変更が別途必要**（このタスクのスコープ外。設計合意の上で別タスクとする）。**Codex は独自に `Recipe` を改変しないこと。**

---

## 完了条件

- [ ] `packages/application/package.json` に `@cookpit/domain` が追加され、`pnpm install` 済み
- [ ] `recipe.dto.ts` / `recipe.mapper.ts` / `recipe-not-found.error.ts` が作成されている
- [ ] `CreateRecipeUseCase` / `GetRecipesUseCase` / `GetRecipeUseCase` / `UpdateRecipeUseCase` / `DeleteRecipeUseCase` が実装されている
- [ ] 各 UseCase が `RecipeRepository` をコンストラクタ注入し、`execute()` のみを公開している
- [ ] 入出力が DTO で完結し、`Recipe` エンティティが Application 層の外に漏れていない
- [ ] `index.ts` から DTO・エラー・各 UseCase が export されている（mapper は除く）
- [ ] `pnpm --filter @cookpit/application type-check` がエラーなく通る
- [ ] 実装後に Claude Code へレビュー依頼を行う
