# Sprint 1：Recipe Hono API 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`tasks/sprint1-recipe-usecase.md` の作業が完了していること（Recipe UseCase 一式が `packages/application/src/recipe/` に実装済み）。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Presentation 層の責務・Hono ルーター・サーバーサイドの2つのアプローチ・依存方向）
- `docs/07-dev-rules.md`（コーディング規約）

また、以下の実装済みファイルを必ず読んでから実装すること。命名・型・インポートパスを推測しないこと。

- `packages/application/src/recipe/recipe.dto.ts`（`RecipeDto` / `CreateRecipeInputDto` / `UpdateRecipeInputDto` / `RecipeIngredientDto` / `CookingStepDto`）
- `packages/application/src/recipe/index.ts`（Application 層が公開する UseCase・DTO・エラー）
- `packages/application/src/recipe/recipe-not-found.error.ts`（`RecipeNotFoundError`）
- `packages/domain/src/shared/unit.ts`（`Unit` のリテラル値）
- `packages/domain/src/recipe/recipe.ts`（`RecipeTag` のリテラル値、`Recipe.create()` の不変条件）
- `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`（`DrizzleRecipeRepository` のコンストラクタ＝`DrizzleClient` を受け取る）
- `apps/web/src/server/app.ts` / `apps/web/src/server/routes/health.ts`（既存 Hono の書き方・ルート登録パターン・`AppType` の export）
- `apps/web/src/db/client.ts`（`createDb()` / `DrizzleClient`）
- `apps/web/src/lib/api-client.ts`（Hono RPC クライアント）

---

## タスク概要

`apps/web` に Recipe の CRUD を提供する Hono API エンドポイントを実装する。

```
Presentation(Hono Route) → Application(UseCase) → Domain ← Infrastructure
```

Hono ルートは **HTTP の境界**として次の3つに徹する。

1. 入力（path param / JSON body）を Zod で検証する（`@cookpit/api-contract`）
2. 検証済みデータを DTO として UseCase に渡し、手動 DI で UseCase を組み立てて実行する
3. 結果（`RecipeDto`）を JSON で返し、ドメイン/アプリのエラーを HTTP ステータスに変換する

ビジネスロジックは UseCase / Domain に既にあるため、ルートに**ロジックを書かない**。

### エンドポイント一覧

| メソッド | パス               | UseCase               | 成功レスポンス        |
| -------- | ------------------ | --------------------- | --------------------- |
| GET      | `/api/recipes`     | `GetRecipesUseCase`   | `200` `RecipeDto[]`   |
| GET      | `/api/recipes/:id` | `GetRecipeUseCase`    | `200` `RecipeDto`     |
| POST     | `/api/recipes`     | `CreateRecipeUseCase` | `201` `RecipeDto`     |
| PUT      | `/api/recipes/:id` | `UpdateRecipeUseCase` | `200` `RecipeDto`     |
| DELETE   | `/api/recipes/:id` | `DeleteRecipeUseCase` | `204` （ボディ無し）  |

`/api` の basePath は既存 `app.ts` の `new Hono().basePath('/api')` が付与する。各ルートのパスは `/recipes` 以下で定義する。

---

## 作成・変更するファイル一覧

```
新規作成
packages/api-contract/src/recipe.schema.ts        # Zod 入力スキーマ
apps/web/src/server/routes/recipes.ts             # Recipe ルート

更新
packages/api-contract/src/index.ts                # recipe.schema を re-export
packages/api-contract/package.json                # zod を依存に追加
apps/web/src/server/app.ts                         # /recipes ルートを登録
apps/web/src/db/client.ts                          # db シングルトンを export
apps/web/package.json                              # @cookpit/application / @cookpit/api-contract / @cookpit/domain を依存に追加
```

---

## ステップ 0：依存関係の追加

### `packages/api-contract/package.json`

`zod` を `dependencies` に追加する（バージョンは `apps/web` と揃え `^4.4.3`）。

```json
{
  "name": "@cookpit/api-contract",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cookpit/config": "workspace:*",
    "typescript": "^5.8.3"
  }
}
```

### `apps/web/package.json`

`dependencies` に以下の3つを追加する（既存の `@cookpit/infrastructure` に並べる）。

```json
"@cookpit/application": "workspace:*",
"@cookpit/api-contract": "workspace:*",
"@cookpit/domain": "workspace:*"
```

> `@cookpit/domain` を直接 import はしないが、`@cookpit/application` が `@cookpit/domain/src/...` へ subpath import しているため、TS のパス解決を確実にする目的で明示的に追加する。

追加後に **`pnpm install`** を実行して workspace リンクを張ること。

---

## ステップ 1：`packages/api-contract/src/recipe.schema.ts`（Zod 入力スキーマ）

HTTP の raw 入力を検証するスキーマを定義する。**Zod の制約はドメインの不変条件と一致させる**こと（一致させることで、検証を通った入力に対して `Recipe.create()` がドメイン例外を投げない）。

`Unit` / `RecipeTag` の値は `packages/domain/src/shared/unit.ts` と `packages/domain/src/recipe/recipe.ts` のリテラル Union と**完全に一致**させること。値を読んでから書き写し、推測しない。

```typescript
import { z } from 'zod';

// packages/domain/src/shared/unit.ts の Unit と一致させること
export const unitSchema = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  '大さじ',
  '小さじ',
  'cup',
  '個',
  '本',
  '枚',
  '玉',
  '尾',
  '切れ',
  '束',
  '袋',
  '缶',
  '合',
]);

// packages/domain/src/recipe/recipe.ts の RecipeTag と一致させること
export const recipeTagSchema = z.enum(['主菜', '副菜', '汁物', '作り置き向き', '冷凍可']);

export const recipeIngredientSchema = z.object({
  productRef: z.string().nullable(),
  displayName: z.string().min(1),
  amountValue: z.number().nullable(),
  amountUnit: unitSchema.nullable(),
  amountNote: z.string().nullable(),
});

export const cookingStepSchema = z.object({
  description: z.string().min(1),
});

// POST /api/recipes のボディ
export const createRecipeSchema = z.object({
  name: z.string().min(1),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  baseServings: z.number().int().positive(),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
});

// PUT /api/recipes/:id のボディ（id は path param で受けるため body には含めない）
export const updateRecipeSchema = z.object({
  name: z.string().min(1),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
});

export type CreateRecipeBody = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeBody = z.infer<typeof updateRecipeSchema>;
```

### 設計のポイント

- `updateRecipeSchema` には `baseServings` を含めない（UseCase 指針の決定どおり。`Recipe` に更新メソッドが無いため）。
- 検証済みの `CreateRecipeBody` / `UpdateRecipeBody` は `CreateRecipeInputDto` / `UpdateRecipeInputDto` と構造的に一致するよう定義する。これにより、ルートで変換コードを書かずに DTO として渡せる（`id` の付与のみ Update で必要）。
- `amountUnit` は `unitSchema` で Union に絞り込むため、DTO の `Unit | null` と型が一致する。

### `packages/api-contract/src/index.ts`

プレースホルダコメントを置き換える。

```typescript
export * from './recipe.schema';
```

---

## ステップ 2：`apps/web/src/db/client.ts`（db シングルトンの追加）

現状このファイルは `createDb()` 関数のみを export しており、`db` インスタンスを公開していない。一方 `health.ts` は `{ db }` を import しているため、**`db` の export を追加**する（health の壊れた import もこれで解消される）。

既存の `createDb` / `DrizzleClient` はそのまま残し、末尾に以下を追加する。

```typescript
const databaseUrl = process.env.DATABASE_URL;

export const db: DrizzleClient | undefined = databaseUrl ? createDb(databaseUrl) : undefined;

export function getDb(): DrizzleClient {
  if (!db) {
    throw new Error('DATABASE_URL is not configured');
  }
  return db;
}
```

> `db`（`undefined` 許容）は `health.ts` の `if (!db)` パターン用に残す。Recipe ルートでは DB 必須のため `getDb()` を使い、未設定時は例外 → `app.onError` で 500 に変換する。

---

## ステップ 3：`apps/web/src/server/routes/recipes.ts`（Recipe ルート）

**1つの `new Hono()` にメソッドチェーンで全エンドポイントを定義**すること。チェーンを分断すると Hono RPC（`hc` クライアント）の型推論が壊れるため、`export const recipesRoute = new Hono().get(...).get(...).post(...).put(...).delete(...)` の形にする。

リポジトリと UseCase は**ハンドラ内で手動 DI**（リクエストごとに組み立て）する。MVP1 では DI コンテナを導入しない。

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '@/db/client';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import {
  CreateRecipeUseCase,
  GetRecipesUseCase,
  GetRecipeUseCase,
  UpdateRecipeUseCase,
  DeleteRecipeUseCase,
} from '@cookpit/application';
import { createRecipeSchema, updateRecipeSchema } from '@cookpit/api-contract';

function recipeRepository() {
  return new DrizzleRecipeRepository(getDb());
}

export const recipesRoute = new Hono()
  .get('/', async (c) => {
    const useCase = new GetRecipesUseCase(recipeRepository());
    const recipes = await useCase.execute();
    return c.json(recipes);
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const useCase = new GetRecipeUseCase(recipeRepository());
    const recipe = await useCase.execute(id);
    return c.json(recipe);
  })
  .post('/', zValidator('json', createRecipeSchema), async (c) => {
    const body = c.req.valid('json');
    const useCase = new CreateRecipeUseCase(recipeRepository());
    const recipe = await useCase.execute(body);
    return c.json(recipe, 201);
  })
  .put('/:id', zValidator('json', updateRecipeSchema), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const useCase = new UpdateRecipeUseCase(recipeRepository());
    const recipe = await useCase.execute({ id, ...body });
    return c.json(recipe);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const useCase = new DeleteRecipeUseCase(recipeRepository());
    await useCase.execute(id);
    return c.body(null, 204);
  });
```

### 設計のポイント

- `@cookpit/infrastructure` / `@cookpit/application` / `@cookpit/api-contract` は各パッケージの `main`（`src/index.ts`）から import する。**subpath import（`/src/...`）はしない**。これらは index.ts で必要物を re-export 済み（infrastructure は `DrizzleRecipeRepository` を export しているか必ず確認し、未 export なら index に追加する）。
- `c.req.valid('json')` の戻り値は `CreateRecipeBody` / `UpdateRecipeBody`。`CreateRecipeInputDto` / `UpdateRecipeInputDto` と構造一致するため、そのまま（Update は `id` を足して）UseCase に渡せる。型エラーが出る場合は **DTO とスキーマの構造ずれ**なので、`as` で潰さずスキーマ側を DTO に合わせて直す。
- 例外はハンドラで try/catch せず、**`app.onError` に集約**する（次ステップ）。

---

## ステップ 4：`apps/web/src/server/app.ts`（ルート登録とエラーハンドリング）

`/recipes` を登録し、`AppType` に含める。さらに `app.onError` で例外を HTTP に変換する。

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { RecipeNotFoundError } from '@cookpit/application';

const app = new Hono().basePath('/api');

const routes = app.route('/health', healthRoute).route('/recipes', recipesRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof routes;
export default app;
```

### 設計のポイント

- `RecipeNotFoundError` → `404`。
- Zod 検証失敗は `@hono/zod-validator` が自動で `400` を返すため、`onError` で扱う必要はない。
- それ以外（DB 未設定 `getDb()` の例外、想定外エラー）→ `500`。
- ドメインの不変条件違反（`Recipe.create()` が投げる `Error`）は、Zod 制約をドメインと一致させているため**通常は発火しない**。MVP1 ではこれらも `500` で許容する。将来、ドメイン例外を専用クラス化して `400` に分類するのは別タスク。

---

## 型チェック

実装後に以下を実行し、エラーが無いことを確認する。

```bash
pnpm --filter @cookpit/api-contract type-check
pnpm --filter @cookpit/web type-check
```

---

## 動作確認（任意・推奨）

`DATABASE_URL` を設定した状態で `pnpm --filter @cookpit/web dev` を起動し、以下を確認する。

```bash
# 一覧
curl http://localhost:3000/api/recipes

# 作成
curl -X POST http://localhost:3000/api/recipes \
  -H 'Content-Type: application/json' \
  -d '{"name":"カレー","ingredients":[],"steps":[],"baseServings":2,"tags":[],"cookingTime":30,"notes":""}'

# 単体取得 / 404 確認
curl http://localhost:3000/api/recipes/<id>
curl -i http://localhost:3000/api/recipes/does-not-exist   # → 404

# 不正入力 400 確認
curl -i -X POST http://localhost:3000/api/recipes -H 'Content-Type: application/json' -d '{}'  # → 400
```

---

## 共通の注意事項

- `any` 型・型アサーション（`as`）は禁止。型エラーは構造を合わせて解消する。
- デフォルトエクスポート禁止（既存 `app.ts` の `export default app` のみ既存踏襲で許容。新規ルート・スキーマは名前付き export）。
- `null` と `undefined` を混在させない（「値なし」は `null`）。
- Hono のルートは**メソッドチェーンを分断しない**（RPC 型推論のため）。
- ルートにビジネスロジック・ドメイン操作を書かない。UseCase 呼び出しと HTTP 変換のみ。
- コメントは「なぜ（Why）」が非自明な場合のみ。

---

## 完了条件

- [ ] `packages/api-contract` に `zod` を追加し、`recipe.schema.ts` を作成・`index.ts` から re-export
- [ ] `apps/web/package.json` に `@cookpit/application` / `@cookpit/api-contract` / `@cookpit/domain` を追加し `pnpm install` 済み
- [ ] `apps/web/src/db/client.ts` に `db` / `getDb()` を追加
- [ ] `apps/web/src/server/routes/recipes.ts` に 5 エンドポイントを単一 Hono チェーンで実装
- [ ] `apps/web/src/server/app.ts` に `/recipes` を登録し、`onError` で `RecipeNotFoundError`→404 / その他→500 を実装
- [ ] `AppType` に `/recipes` が含まれている（`hc` クライアントから型が見える）
- [ ] `pnpm --filter @cookpit/api-contract type-check` と `pnpm --filter @cookpit/web type-check` がエラーなく通る
- [ ] 実装後に Claude Code へレビュー依頼を行う
</content>
</invoke>
