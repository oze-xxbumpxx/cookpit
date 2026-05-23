# Sprint 1：DrizzleRecipeRepository 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`tasks/sprint1-infrastructure-setup.md` の作業が完了していること。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（依存方向・ドメインモデルと DB スキーマの責務分離）
- `docs/04-domain-model.md`（Recipe 集約の構造）
- `docs/07-dev-rules.md`（コーディング規約）

また、以下の実装済みファイルを必ず読んでから実装すること。

- `packages/domain/src/recipe/recipe.ts`（Recipe エンティティ・getterの名前）
- `packages/domain/src/recipe/recipe-ingredient.ts`（RecipeIngredient・フィールド名）
- `packages/domain/src/recipe/recipe-id.ts`（RecipeId）
- `packages/domain/src/recipe/cooking-step.ts`（CookingStep）
- `packages/domain/src/shared/quantity.ts`（Quantity）
- `packages/infrastructure/src/db/schema.ts`（RecipeRow・NewRecipeRow）

---

## タスク概要

`packages/infrastructure` に以下を実装する。

1. DB クライアント（`src/db/client.ts`）
2. `DrizzleRecipeRepository`（`src/repositories/drizzle-recipe.repository.ts`）
3. `index.ts` からのエクスポート追加

`DrizzleRecipeRepository` は `packages/domain` の `RecipeRepository` インターフェースを実装する。
ドメインモデル（Recipe / RecipeIngredient / CookingStep）と DB 行（RecipeRow）の変換責任を持つ。

---

## 作成・変更するファイル一覧

```
新規作成
packages/infrastructure/src/db/client.ts
packages/infrastructure/src/repositories/drizzle-recipe.repository.ts

更新
packages/infrastructure/src/index.ts
```

---

## ステップ 1：`packages/infrastructure/src/db/client.ts`

`apps/web/src/db/client.ts` を参考に、infrastructure パッケージ用の DB クライアントを作成する。

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type DrizzleClient = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}
```

### 設計のポイント

- `apps/web/src/db/client.ts` はシングルトン（モジュールレベルで `db` を生成）だが、
  こちらはファクトリ関数にする。DI（依存性注入）でテスタビリティを確保するため。
- `databaseUrl` を引数で受け取り、呼び出し側（Hono ルーター）が `process.env.DATABASE_URL` を渡す。

---

## ステップ 2：`packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`

### JSONB の格納型定義

ファイル内にローカルで定義する（エクスポート不要）。

```typescript
type IngredientRow = {
  productRef: string | null;
  displayName: string;
  amountValue: number | null;
  amountUnit: string | null;
  amountNote: string | null;
};

type StepRow = {
  description: string;
};
```

### クラス定義

```typescript
import { eq } from 'drizzle-orm';
import { CookingStep } from '@cookpit/domain/recipe/cooking-step'; // ← 実際のインポートパスは下記参照
// ...

export class DrizzleRecipeRepository implements RecipeRepository {
  constructor(private readonly db: DrizzleClient) {}
  // ...
}
```

**インポートパスについて**：`@cookpit/domain` の `main` は `./src/index.ts` だが、
現時点で `domain/src/index.ts` はほぼ空のため、個別ファイルへの相対的なインポートが必要になる場合がある。
`packages/domain/src/index.ts` の内容を確認してから判断すること。

### 実装するメソッド

#### `findById(id: RecipeId): Promise<Recipe | null>`

```typescript
async findById(id: RecipeId): Promise<Recipe | null> {
  const rows = await this.db
    .select()
    .from(recipes)
    .where(eq(recipes.id, id.value))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return this.toEntity(row);
}
```

#### `findAll(): Promise<Recipe[]>`

```typescript
async findAll(): Promise<Recipe[]> {
  const rows = await this.db
    .select()
    .from(recipes)
    .orderBy(recipes.createdAt);

  return rows.map((row) => this.toEntity(row));
}
```

#### `save(recipe: Recipe): Promise<void>`

新規作成・更新を1メソッドで処理するため **upsert** を使う。

```typescript
async save(recipe: Recipe): Promise<void> {
  const row = this.toRow(recipe);

  await this.db
    .insert(recipes)
    .values(row)
    .onConflictDoUpdate({
      target: recipes.id,
      set: {
        name:         row.name,
        baseServings: row.baseServings,
        cookingTime:  row.cookingTime,
        tags:         row.tags,
        notes:        row.notes,
        ingredients:  row.ingredients,
        steps:        row.steps,
        updatedAt:    row.updatedAt,
      },
    });
}
```

#### `delete(id: RecipeId): Promise<void>`

```typescript
async delete(id: RecipeId): Promise<void> {
  await this.db.delete(recipes).where(eq(recipes.id, id.value));
}
```

### プライベートメソッド：ドメイン ↔ DB 変換

#### `toEntity(row: RecipeRow): Recipe`（DB → ドメイン）

`Recipe.reconstruct()` を使って復元する。JSONB の各要素を対応するドメインオブジェクトに変換する。

```typescript
private toEntity(row: RecipeRow): Recipe {
  const ingredients = (row.ingredients as IngredientRow[]).map((ing) => {
    const amount =
      ing.amountValue !== null && ing.amountUnit !== null
        ? Quantity.of(ing.amountValue, ing.amountUnit as Unit)
        : null;

    return RecipeIngredient.create({
      productRef: ing.productRef ? { value: ing.productRef } : null,
      displayName: ing.displayName,
      amount,
      amountNote: ing.amountNote,
    });
  });

  const steps = (row.steps as StepRow[]).map(
    (step) => new CookingStep(step.description),
  );

  return Recipe.reconstruct({
    id:           RecipeId.fromString(row.id),
    name:         row.name,
    ingredients,
    steps,
    baseServings: row.baseServings,
    tags:         row.tags as RecipeTag[],
    cookingTime:  row.cookingTime,
    notes:        row.notes,
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  });
}
```

#### `toRow(recipe: Recipe): NewRecipeRow`（ドメイン → DB）

```typescript
private toRow(recipe: Recipe): NewRecipeRow {
  const ingredients: IngredientRow[] = recipe.ingredients.map((ing) => ({
    productRef:  ing.productRef?.value ?? null,
    displayName: ing.displayName,
    amountValue: ing.amount?.value ?? null,
    amountUnit:  ing.amount?.unit ?? null,
    amountNote:  ing.amountNote,
  }));

  const steps: StepRow[] = recipe.steps.map((step) => ({
    description: step.description,
  }));

  return {
    id:           recipe.id.value,
    name:         recipe.name,
    baseServings: recipe.baseServings,
    cookingTime:  recipe.cookingTime,
    tags:         recipe.tags,
    notes:        recipe.notes,
    ingredients,
    steps,
    createdAt:    recipe.createdAt,
    updatedAt:    recipe.updatedAt,
  };
}
```

---

## ステップ 3：`packages/infrastructure/src/index.ts` を更新

```typescript
export * from './db/schema';
export * from './db/client';
export * from './repositories/drizzle-recipe.repository';
```

---

## 型チェック

実装後に以下を実行してエラーがないことを確認する。

```bash
pnpm --filter @cookpit/infrastructure type-check
```

---

## 共通の注意事項

- `any` 型は禁止。型アサーション（`as`）は JSONB のパース箇所のみ許容する
- デフォルトエクスポートは禁止。名前付きエクスポートのみ
- `null` と `undefined` を混在させない（「値なし」は `null` に統一）
- コメントは「なぜ（Why）」が非自明な場合のみ書く

---

## 完了条件

- [ ] `packages/infrastructure/src/db/client.ts` が作成されている
- [ ] `DrizzleRecipeRepository` が `RecipeRepository` インターフェースを実装している
- [ ] `toEntity` / `toRow` で IngredientRow・StepRow・Quantity・RecipeIngredient の変換が正しく行われている
- [ ] `pnpm --filter @cookpit/infrastructure type-check` がエラーなく通る
- [ ] 実装後に Claude Code へレビュー依頼を行う
