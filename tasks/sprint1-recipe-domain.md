# Sprint 1：Recipe ドメイン層 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（依存方向・ディレクトリ構成）
- `docs/04-domain-model.md`（Recipe 集約の設計）
- `docs/07-dev-rules.md`（命名規則・コーディング規約）

---

## タスク概要

`packages/domain/` に Recipe 集約のドメインモデルを実装する。

このパッケージは他のいかなるパッケージにも依存しない。
Node 標準ライブラリと TypeScript のみ使用すること。

---

## 作成するファイル一覧

```
packages/domain/src/
├── shared/
│   ├── unit.ts
│   └── quantity.ts
└── recipe/
    ├── recipe-id.ts
    ├── cooking-step.ts
    ├── recipe-ingredient.ts
    ├── recipe.repository.ts
    └── recipe.ts
```

---

## 各ファイルの仕様

### `shared/unit.ts`

```typescript
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'piece' | 'pinch';
```

---

### `shared/quantity.ts`

- `value: number`、`unit: Unit` を持つ値オブジェクト
- コンストラクタは `private`
- `static of(value: number, unit: Unit): Quantity` で生成。`value < 0` なら `Error` を投げる
- `multiply(factor: number): Quantity` を実装（新しい Quantity を返す、元は変更しない）
- ゲッター `value` / `unit` を公開する

---

### `recipe/recipe-id.ts`

- `value: string` を持つ値オブジェクト
- コンストラクタは `private`
- `static generate(): RecipeId`：`crypto.randomUUID()` で生成
- `static fromString(value: string): RecipeId`：既存の文字列から復元
- `equals(other: RecipeId): boolean` を実装
- ゲッター `value` を公開する

---

### `recipe/cooking-step.ts`

- `description: string` のみを持つシンプルな値オブジェクト
- `order` フィールドは不要（配列インデックスで順序を管理する）
- コンストラクタは `public`
- `description` は `readonly`
- `description` が空文字なら `Error` を投げる

---

### `recipe/recipe-ingredient.ts`

- `productRef: ProductId | null`、`displayName: string`、`amount: Quantity` を持つ値オブジェクト
- `ProductId` は以下の型をこのファイル内でローカル定義する（Sprint 1 では Product 集約未実装のため）

```typescript
interface ProductId {
  readonly value: string;
}
```

- コンストラクタは `private`
- `static create(props: { productRef: ProductId | null; displayName: string; amount: Quantity }): RecipeIngredient` で生成
  - `displayName` が空文字なら `Error` を投げる
- `scale(factor: number): RecipeIngredient`：`amount.multiply(factor)` した新しい `RecipeIngredient` を返す
- ゲッター `productRef` / `displayName` / `amount` を公開する

---

### `recipe/recipe.repository.ts`

Repository のインターフェース定義のみ。実装は Infrastructure 層で行う。

```typescript
import type { Recipe } from './recipe';
import type { RecipeId } from './recipe-id';

export interface RecipeRepository {
  findById(id: RecipeId): Promise<Recipe | null>;
  findAll(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<void>;
  delete(id: RecipeId): Promise<void>;
}
```

---

### `recipe/recipe.ts`

Recipe 集約ルート。

#### 型定義

```typescript
export type RecipeTag = '主菜' | '副菜' | '汁物' | '作り置き向き' | '冷凍可';

interface CreateRecipeInput {
  name: string;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
  baseServings: number;
  tags?: RecipeTag[];
  cookingTime?: number | null; // 分単位
  notes?: string;
}

interface RecipeProps {
  id: RecipeId;
  name: string;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
  baseServings: number;
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### フィールド（すべて `private`）

| フィールド      | 型                   | readonly |
| --------------- | -------------------- | -------- |
| `_id`           | `RecipeId`           | ✓        |
| `_name`         | `string`             |          |
| `_ingredients`  | `RecipeIngredient[]` |          |
| `_steps`        | `CookingStep[]`      |          |
| `_baseServings` | `number`             |          |
| `_tags`         | `RecipeTag[]`        |          |
| `_cookingTime`  | `number \| null`     |          |
| `_notes`        | `string`             |          |
| `_createdAt`    | `Date`               | ✓        |
| `_updatedAt`    | `Date`               |          |

#### メソッド

**生成・復元**

- `static create(input: CreateRecipeInput): Recipe`
  - `name.trim() === ''` なら `Error`
  - `baseServings <= 0` なら `Error`
  - `RecipeId.generate()` で ID を採番
  - `tags` のデフォルト値は `[]`、`cookingTime` は `null`、`notes` は `''`
  - `createdAt` / `updatedAt` は `new Date()`

- `static reconstruct(props: RecipeProps): Recipe`
  - バリデーションなし、そのまま復元する

**更新系（各メソッドで `_updatedAt = new Date()` を実行する）**

- `rename(name: string): void`：`name.trim() === ''` なら `Error`
- `updateIngredients(ingredients: RecipeIngredient[]): void`
- `updateSteps(steps: CookingStep[]): void`
- `updateTags(tags: RecipeTag[]): void`
- `updateNotes(notes: string): void`
- `updateCookingTime(minutes: number | null): void`

**読み取り系**

- `scaleIngredients(scaleFactor: number): RecipeIngredient[]`：各 ingredient に `scale(scaleFactor)` を適用して返す（`_ingredients` は変更しない）

**ゲッター**

`id` / `name` / `ingredients` / `steps` / `baseServings` / `tags` / `cookingTime` / `notes` / `createdAt` / `updatedAt`

---

## 共通の注意事項

- `any` 型は禁止。`unknown` を使う
- デフォルトエクスポートは禁止。名前付きエクスポートのみ
- `null` と `undefined` を混在させない（「値なし」は `null` に統一）
- コメントは「なぜ（Why）」が非自明な場合のみ書く。What のコメントは書かない
- セミコロンは付ける

---

## 完了条件

- [ ] 上記すべてのファイルが作成されている
- [ ] TypeScript のコンパイルエラーがない（`pnpm --filter @repo/domain tsc --noEmit` で確認）
- [ ] 実装後に Claude Code へレビュー依頼を行う
