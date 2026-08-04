# Sprint 1 Recipe Hono API 実装計画

## 目的

Recipe CRUD を `apps/web` の Hono API として公開し、フロントエンドから Hono RPC / TanStack Query 経由で利用できる状態にする。

このタスクでは Presentation 層の HTTP 境界を実装する。ビジネスロジックは既に Application / Domain / Infrastructure 層にあるため、Hono ルートは入力検証、UseCase 呼び出し、HTTP レスポンス変換だけを担当する。

依存方向は次を守る。

```text
Presentation(Hono Route) -> Application(UseCase) -> Domain <- Infrastructure
```

## ゴール

- `GET /api/recipes` で Recipe 一覧を取得できる。
- `GET /api/recipes/:id` で Recipe 詳細を取得できる。
- `POST /api/recipes` で Recipe を作成できる。
- `PUT /api/recipes/:id` で Recipe を更新できる。
- `DELETE /api/recipes/:id` で Recipe を削除できる。
- HTTP 入力は `@cookpit/api-contract` の Zod スキーマで検証する。
- `RecipeNotFoundError` は `404` に変換する。
- Hono RPC の型推論に `/recipes` が含まれる。
- `pnpm --filter @cookpit/api-contract type-check` と `pnpm --filter @cookpit/web type-check` が通る。
- 実装後に Claude Code へレビューを依頼する。

## スコープ

### 対象

- `packages/api-contract/package.json`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/recipe.schema.ts`
- `packages/application/src/index.ts`
- `apps/web/package.json`
- `apps/web/src/db/client.ts`
- `apps/web/src/server/routes/recipes.ts`
- `apps/web/src/server/app.ts`

### 対象外

- Domain 層の修正
- UseCase の修正
- Repository の修正
- UI 実装
- 認証・認可
- ページネーション、検索、タグフィルタ
- E2E テスト

## 前提

- `packages/application/src/recipe/` に Recipe CRUD UseCase と DTO が実装済みである。
- `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` に `DrizzleRecipeRepository` が実装済みである。
- `apps/web/src/app/api/[[...route]]/route.ts` で Hono app が Next.js API Route にマウント済みである。
- `apps/web/src/server/app.ts` は `new Hono().basePath('/api')` を使っているため、Recipe ルート側では `/recipes` 以下だけを定義する。
- `apps/web/src/lib/api-client.ts` は既存の Hono RPC クライアントを維持する。

現状確認時点では、`packages/application/src/recipe/index.ts` は Recipe UseCase を export しているが、`packages/application/src/index.ts` は placeholder のままである。`apps/web` から `@cookpit/application` を import するため、このタスク内で root export を更新する。

## API 仕様

| メソッド | パス               | UseCase               | 成功レスポンス      |
| -------- | ------------------ | --------------------- | ------------------- |
| GET      | `/api/recipes`     | `GetRecipesUseCase`   | `200` `RecipeDto[]` |
| GET      | `/api/recipes/:id` | `GetRecipeUseCase`    | `200` `RecipeDto`   |
| POST     | `/api/recipes`     | `CreateRecipeUseCase` | `201` `RecipeDto`   |
| PUT      | `/api/recipes/:id` | `UpdateRecipeUseCase` | `200` `RecipeDto`   |
| DELETE   | `/api/recipes/:id` | `DeleteRecipeUseCase` | `204` ボディなし    |

## 作成・変更ファイル

```text
packages/
├── api-contract/
│   ├── package.json                 # zod を dependencies に追加
│   └── src/
│       ├── index.ts                 # recipe.schema を re-export
│       └── recipe.schema.ts         # 新規作成
└── application/
    └── src/
        └── index.ts                 # ./recipe を re-export

apps/web/
├── package.json                     # application / api-contract / domain を依存に追加
└── src/
    ├── db/
    │   └── client.ts                # db / getDb を export
    └── server/
        ├── app.ts                   # /recipes 登録と onError
        └── routes/
            └── recipes.ts           # 新規作成
```

## 実装手順

### 1. 依存関係を追加する

`packages/api-contract/package.json` の `dependencies` に `zod` を追加する。

```json
{
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

`apps/web/package.json` の `dependencies` に以下を追加する。

```json
{
  "@cookpit/application": "workspace:*",
  "@cookpit/api-contract": "workspace:*",
  "@cookpit/domain": "workspace:*"
}
```

`@cookpit/domain` は `apps/web` から直接 import しないが、`@cookpit/application` が Domain の subpath を参照しているため、workspace の型解決を安定させる目的で明示する。

変更後に workspace link を更新する。

```bash
pnpm install
```

### 2. `packages/api-contract/src/recipe.schema.ts` を作成する

HTTP の raw input を検証する Zod スキーマを定義する。Zod の制約は Domain の不変条件と一致させる。

特に以下を推測せず、実装済みコードの literal union と一致させる。

- `packages/domain/src/shared/unit.ts` の `Unit`
- `packages/domain/src/recipe/recipe.ts` の `RecipeTag`
- `packages/application/src/recipe/recipe.dto.ts` の DTO 構造

```typescript
import { z } from 'zod';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'Required',
});

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

export const recipeTagSchema = z.enum(['主菜', '副菜', '汁物', '作り置き向き', '冷凍可']);

export const recipeIngredientSchema = z
  .object({
    productRef: z.string().nullable(),
    displayName: nonBlankString,
    amountValue: z.number().nonnegative().nullable(),
    amountUnit: unitSchema.nullable(),
    amountNote: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    const hasAmountValue = value.amountValue !== null;
    const hasAmountUnit = value.amountUnit !== null;
    const hasAmountNote = value.amountNote !== null && value.amountNote.trim() !== '';

    if (value.amountNote !== null && value.amountNote.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['amountNote'],
        message: 'amountNote must be non-blank when provided',
      });
    }

    if (hasAmountValue !== hasAmountUnit) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountUnit'],
        message: 'amountValue and amountUnit must be provided together',
      });
    }

    if (hasAmountValue && hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountNote'],
        message: 'amount and amountNote cannot both be set',
      });
    }

    if (!hasAmountValue && !hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountValue'],
        message: 'Either amount or amountNote is required',
      });
    }
  });

export const cookingStepSchema = z.object({
  description: nonBlankString,
});

export const createRecipeSchema = z.object({
  name: nonBlankString,
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  baseServings: z.number().int().positive(),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
});

export const updateRecipeSchema = z.object({
  name: nonBlankString,
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
});

export type CreateRecipeBody = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeBody = z.infer<typeof updateRecipeSchema>;
```

設計ポイント:

- `updateRecipeSchema` には `baseServings` を含めない。`Recipe` に基準人数の更新メソッドがないため、UseCase 指針どおり更新対象外にする。
- `RecipeIngredient` は `amount` と `amountNote` のどちらか一方だけを許可するため、API 境界でも同じ制約をかける。
- `nonBlankString` は `.trim()` で値を変換せず、Domain と同じく空白のみを不正値として扱う。
- 型エラーが出た場合は `as` で潰さず、DTO と Zod スキーマの構造差分を直す。

### 3. api-contract の public export を更新する

`packages/api-contract/src/index.ts` を次にする。

```typescript
export * from './recipe.schema';
```

### 4. application の root export を更新する

`apps/web` から `@cookpit/application` を import できるよう、`packages/application/src/index.ts` を次にする。

```typescript
export * from './recipe';
```

`packages/application/src/recipe/index.ts` に UseCase / DTO / Error が export 済みであることも確認する。

### 5. `apps/web/src/db/client.ts` に DB singleton を追加する

Hono ルートから DB 必須で UseCase を実行できるよう、`db` と `getDb()` を export する。

「値なし」はプロジェクト規約に合わせて `null` に統一する。`health.ts` の `if (!db)` は `null` でもそのまま機能する。

```typescript
import { createDb as createInfrastructureDb, type DrizzleClient } from '@cookpit/infrastructure';

export function createDb(databaseUrl: string): DrizzleClient {
  return createInfrastructureDb(databaseUrl);
}

const databaseUrl = process.env.DATABASE_URL ?? null;

export const db: DrizzleClient | null = databaseUrl !== null ? createDb(databaseUrl) : null;

export function getDb(): DrizzleClient {
  if (db === null) {
    throw new Error('DATABASE_URL is not configured');
  }

  return db;
}
```

設計ポイント:

- `DrizzleRecipeRepository` が期待する `DrizzleClient` と同じ型を使うため、`@cookpit/infrastructure` の `createDb` に委譲する。
- ルート内で `process.env` を直接読まない。
- DB 未設定時は `getDb()` が例外を投げ、`app.onError` で `500` に変換する。

### 6. `apps/web/src/server/routes/recipes.ts` を作成する

Hono RPC の型推論を維持するため、1 つの `new Hono()` にメソッドチェーンで全エンドポイントを定義する。途中で `const route = new Hono(); route.get(...)` のように分断しない。

```typescript
import { zValidator } from '@hono/zod-validator';
import { createRecipeSchema, updateRecipeSchema } from '@cookpit/api-contract';
import {
  CreateRecipeUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  GetRecipesUseCase,
  UpdateRecipeUseCase,
} from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { Hono } from 'hono';
import { getDb } from '@/db/client';

function recipeRepository(): DrizzleRecipeRepository {
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

設計ポイント:

- ルート内では Repository と UseCase を手動 DI で組み立てる。
- ルートに Recipe の不変条件や DB 行変換を書かない。
- ハンドラごとの `try/catch` は書かず、エラー変換は `app.onError` に集約する。
- `@cookpit/application` / `@cookpit/api-contract` / `@cookpit/infrastructure` は package root から import する。

### 7. `apps/web/src/server/app.ts` に `/recipes` を登録する

`/recipes` ルートを登録し、`RecipeNotFoundError` を `404` に変換する。

```typescript
import { RecipeNotFoundError } from '@cookpit/application';
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';

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

設計ポイント:

- `AppType` は `routes` から export し、Hono RPC クライアントに `/recipes` の型を渡す。
- Zod 検証失敗は `@hono/zod-validator` が `400` として返すため、`onError` では扱わない。
- Domain の通常 `Error` は、MVP1 では想定外として `500` に寄せる。将来の専用 Domain Error 化は別タスクにする。
- 既存 `export default app` は Next.js Hono マウントのため継続する。新規ファイルでは名前付き export を使う。

## 動作確認

型チェックを実行する。

```bash
pnpm --filter @cookpit/api-contract type-check
pnpm --filter @cookpit/web type-check
```

`DATABASE_URL` を設定できる場合は、開発サーバーを起動して API を確認する。

```bash
pnpm --filter @cookpit/web dev
```

```bash
curl http://localhost:3000/api/recipes

curl -X POST http://localhost:3000/api/recipes \
  -H 'Content-Type: application/json' \
  -d '{"name":"カレー","ingredients":[],"steps":[],"baseServings":2,"tags":[],"cookingTime":30,"notes":""}'

curl -i http://localhost:3000/api/recipes/does-not-exist

curl -i -X POST http://localhost:3000/api/recipes \
  -H 'Content-Type: application/json' \
  -d '{}'
```

期待値:

- 一覧取得は `200`。
- 作成は `201`。
- 存在しない ID は `404`。
- 不正な JSON body は `400`。
- `DATABASE_URL` 未設定時の Recipe API は `500`。

## 実装時の注意事項

- `any` は使わない。必要な場合も `unknown` を検討する。
- 型アサーションで DTO / Zod のずれを隠さない。
- 型のみの import は `import type` を使う。
- 「値なし」は `null` に統一する。
- Hono ルートはメソッドチェーンを分断しない。
- `basePath('/api')` は `app.ts` 側だけで扱い、`recipes.ts` には `/api` を書かない。
- Presentation 層にドメインロジックを書かない。
- スコープ外の UI や Repository の改善はこのタスクに混ぜない。

## 完了条件

- [ ] `packages/api-contract/package.json` に `zod` が追加されている。
- [ ] `packages/api-contract/src/recipe.schema.ts` が作成されている。
- [ ] `packages/api-contract/src/index.ts` が `recipe.schema` を re-export している。
- [ ] `packages/application/src/index.ts` が `./recipe` を re-export している。
- [ ] `apps/web/package.json` に `@cookpit/application` / `@cookpit/api-contract` / `@cookpit/domain` が追加されている。
- [ ] `pnpm install` が実行済みである。
- [ ] `apps/web/src/db/client.ts` が `db` / `getDb()` を export している。
- [ ] `apps/web/src/server/routes/recipes.ts` に 5 エンドポイントが単一 Hono チェーンで実装されている。
- [ ] `apps/web/src/server/app.ts` が `/recipes` を登録している。
- [ ] `app.onError` で `RecipeNotFoundError` が `404` に変換されている。
- [ ] `AppType` に `/recipes` が含まれている。
- [ ] `pnpm --filter @cookpit/api-contract type-check` が通る。
- [ ] `pnpm --filter @cookpit/web type-check` が通る。
- [ ] 実装結果を Claude Code へレビュー依頼できる状態になっている。
