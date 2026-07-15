# Task 5: Presentation 層 — pantry ルート 3 本 + complete エンドポイント + app.ts 統合

## 概要

`apps/web/src/server/routes/pantry.ts`（Hono・**3 エンドポイント**）を新規作成し、
`shopping-lists.ts` に `POST /:id/complete` を追記、`app.ts` にマウント + `onError` へ
新規エラー 2 種の分岐を追記する。**模範コード**: `apps/web/src/server/routes/shopping-lists.ts` +
`shopping-lists.test.ts`（手動 DI ファクトリ関数・`zValidator`・`vi.mock` ルートテスト形式）。

依存: Task 2（`DrizzlePantryRepository`）・Task 3（UseCase 4 本）・Task 4（Zod スキーマ）
すべて完了していること。

## アーキテクチャ制約（必ず遵守）

- Presentation 層は UseCase を呼ぶだけ。ドメインロジックを書かない
- UseCase の組み立て（手動 DI）はルート側で行う
- `any` 禁止 / default export 禁止（`app.ts` の既存 `export default app` は既存構造のため例外・
  変更しない）/ 型のみは `import type` / `===` `!==`
- **`app.ts` の `export const routes` は lint 回避で必要な既存構造。削除・変更しない**
- サーバーサイドのルートファイルのため **`'use client'` は不要**（付けない）

## 実装対象ファイル

| 種別 | ファイル                                            | 内容                                                                                       |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 新規 | `apps/web/src/server/routes/pantry.ts`              | `pantryRoute`（GET `/`・POST `/stocks/:stockId/consume`・POST `/stocks/:stockId/discard`） |
| 新規 | `apps/web/src/server/routes/pantry.test.ts`         | ルートテスト                                                                               |
| 追記 | `apps/web/src/server/routes/shopping-lists.ts`      | `POST /:id/complete` 追加                                                                  |
| 追記 | `apps/web/src/server/routes/shopping-lists.test.ts` | complete エンドポイントのテスト追加                                                        |
| 追記 | `apps/web/src/server/app.ts`                        | `.route('/pantry', pantryRoute)` + onError 2 分岐追記                                      |

## 1. `routes/pantry.ts`（そのまま実装）

```typescript
import { getDb } from '@/db/client';
import { consumeStockSchema, stockIdParamSchema } from '@cookpit/api-contract';
import { ConsumeStockUseCase, DiscardStockUseCase, GetPantryUseCase } from '@cookpit/application';
import { DrizzlePantryRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

export const pantryRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetPantryUseCase(pantryRepository());
    const dto = await usecase.execute();
    return c.json(dto, 200);
  })
  .post(
    '/stocks/:stockId/consume',
    zValidator('param', stockIdParamSchema),
    zValidator('json', consumeStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new ConsumeStockUseCase(pantryRepository());
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  )
  .post('/stocks/:stockId/discard', zValidator('param', stockIdParamSchema), async (c) => {
    const { stockId } = c.req.valid('param');
    const usecase = new DiscardStockUseCase(pantryRepository());
    const dto = await usecase.execute({ stockId });
    return c.json(dto, 200);
  });
```

**discard に `zValidator('json', ...)` を付けない**（ボディなし POST。S-10）。

## 2. `routes/shopping-lists.ts` 追記

既存の `mealPlanRepository()`/`productRepository()`/`shoppingListRepository()` ファクトリ関数と
`shoppingListIdParamSchema` の import は再利用する。追加が必要なのは次の 3 点のみ:

```typescript
// (1) import 追記（既存 import 文への追加のみ）
import { CompleteShoppingUseCase /* + 既存の他 UseCase */ } from '@cookpit/application';
import { DrizzlePantryRepository /* + 既存の他 Repository */ } from '@cookpit/infrastructure';

// (2) 既存ファクトリ関数群の末尾に追加
function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

// (3) .post(...) チェーンの末尾に追加（既存 5 エンドポイントの後）
  .post('/:id/complete', zValidator('param', shoppingListIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const usecase = new CompleteShoppingUseCase(
      shoppingListRepository(),
      pantryRepository(),
      productRepository(),
      mealPlanRepository(),
    );
    const dto = await usecase.execute({ shoppingListId: id });
    return c.json(dto, 200);
  });
```

**新規 Zod スキーマの import は不要**（既存 `shoppingListIdParamSchema` を再利用。ボディなし）。
既存 5 エンドポイントの定義・順序は変更しない。

## 3. `app.ts` 統合（既存 9 分岐の順序・挙動は変更しない）

```typescript
// import 追記
import { pantryRoute } from './routes/pantry';
import {
  InvalidStockOperationError,
  StockNotFoundError,
  /* 既存の他エラークラス */
} from '@cookpit/application';

// export const routes = app.route(...) チェーンの末尾に追加
  .route('/pantry', pantryRoute);

// onError 内、ShoppingList 系分岐（InvalidShoppingListStateError）の直後・console.error の前に追加
if (err instanceof StockNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof InvalidStockOperationError) {
  return c.json({ error: err.message }, 422);
}
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- ルート変数名は **`pantryRoute`**（`pantriesRoute` にしない。Pantry は常在単一のためパスも
  `/pantry` 単数。**テーブル名 `stocks` とは別**なので混同しない）
- エンドポイントは **3 + 1 本のみ**: `GET /api/pantry` / `POST /api/pantry/stocks/:stockId/consume` /
  `POST /api/pantry/stocks/:stockId/discard` / `POST /api/shopping-lists/:id/complete`。
  それ以外（在庫の直接追加 API・一覧クエリ・complete のショートカット等）を作らない
- パスセグメントの綴り: `stocks` / `consume` / `discard` / `complete`（すべて小文字）
- **complete のステータスは初回・冪等再実行とも常に 200**（ADR-0006 の Generate 201/200 分岐とは
  **意図的に異なる**。分岐を作らない）
- `CompleteShoppingUseCase` のコンストラクタ引数順:
  **shoppingList → pantry → product → mealPlan**（Task 3 のシグネチャと一致させる）
- 各ハンドラで `c.req.valid('param')` / `c.req.valid('json')` を正しく取り出す
  （consume は param + json の 2 バリデータ、discard は param のみ）

## テスト

**`pantry.test.ts`（新規。`vi.mock('@/db/client')` + `vi.mock('@cookpit/application', ...)`
パターンは `shopping-lists.test.ts` を踏襲）**:

- `GET /api/pantry`: 空でも **200** + `{ stocks: [] }`（**404 にならない**。S-1）／複数 Stock 全件
- `POST /api/pantry/stocks/:stockId/consume`: 200 + `PantryDto`／`amount.value: 0` で 400（D-6）／
  不正 `stockId`（uuid でない）で 400／`StockNotFoundError` → 404／`InvalidStockOperationError` → 422
- `POST /api/pantry/stocks/:stockId/discard`: 200 + `PantryDto`／不正 `stockId` で 400／
  `StockNotFoundError` → 404

**`shopping-lists.test.ts` 追記**:

- `POST /api/shopping-lists/:id/complete`: 200 + `ShoppingListDto`／不正 `id` で 400／
  `ShoppingListNotFoundError` → 404／**2 回連続呼び出しで両方 200・レスポンス形が一致**
  （契約レベルの冪等確認）

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` 全 green
- [ ] `pnpm --filter @cookpit/web type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `app.ts` の既存 onError 9 分岐の順序・挙動に変更がない（末尾側に 2 分岐追加のみ）
- [ ] `pantryRoute` が `/api/pantry` にマウントされている
- [ ] `GET /api/pantry` が常に 200 を返す（404 分岐が存在しない）確認テストがある
- [ ] complete が初回・再実行とも 200 を返す（201 分岐を作っていない）
