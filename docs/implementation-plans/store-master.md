# 実装計画: store-master

- ステータス: ready
- レベル: L3
- 設計書: `docs/designs/store-master.md`
- 作業ブランチ: `claude/backlog-tasks-28cpv8`

---

## 概要

Store マスタの全層縦スライス実装。Recipe 縦スライスを先例として踏襲し、
Domain → Infrastructure → Application → API Contract → Presentation の順に実装する。
マイグレーション生成は schema.ts 変更直後に挿入する。

---

## 変更対象ファイル一覧

### 既存ファイル変更（6 ファイル）

| #   | ファイルパス                                     | 変更種別                                                      |
| --- | ------------------------------------------------ | ------------------------------------------------------------- |
| E-1 | `packages/domain/src/shared/store.repository.ts` | `save()` メソッド追加                                         |
| E-2 | `packages/infrastructure/src/db/schema.ts`       | `stores` テーブル定義追記                                     |
| E-3 | `packages/infrastructure/src/index.ts`           | `DrizzleStoreRepository` エクスポート追加                     |
| E-4 | `packages/application/src/index.ts`              | `store` モジュールエクスポート追加                            |
| E-5 | `packages/api-contract/src/index.ts`             | `store.schema` エクスポート追加                               |
| E-6 | `apps/web/src/server/app.ts`                     | `storesRoute` マウント、`StoreNotFoundError` ハンドリング追加 |

### 新規作成ファイル（9 ファイル + マイグレーション）

| #    | ファイルパス                                                           | 内容                                                |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| N-1  | `packages/infrastructure/src/repositories/drizzle-store.repository.ts` | `DrizzleStoreRepository`                            |
| N-2  | `packages/application/src/store/store.dto.ts`                          | `StoreDto`、`CreateStoreInputDto`                   |
| N-3  | `packages/application/src/store/store.mapper.ts`                       | `toStoreDto()`                                      |
| N-4  | `packages/application/src/store/store-not-found.error.ts`              | `StoreNotFoundError`                                |
| N-5  | `packages/application/src/store/get-stores.use-case.ts`                | `GetStoresUseCase`                                  |
| N-6  | `packages/application/src/store/create-store.use-case.ts`              | `CreateStoreUseCase`                                |
| N-7  | `packages/application/src/store/index.ts`                              | バレルエクスポート                                  |
| N-8  | `packages/api-contract/src/store.schema.ts`                            | `createStoreSchema`、`storeResponseSchema`          |
| N-9  | `apps/web/src/server/routes/stores.ts`                                 | `storesRoute`（Hono）                               |
| N-10 | `apps/web/src/db/migrations/` 以下                                     | `pnpm --filter @cookpit/web db:generate` で自動生成 |

---

## 実装ステップ

### Step 1: Domain 層変更

**対象ファイル**: `packages/domain/src/shared/store.repository.ts`

**現在の内容**:

```typescript
import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
}
```

**変更内容**: `save(store: Store): Promise<void>` をインターフェースに追加する。

**変更後の全内容**:

```typescript
import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
  save(store: Store): Promise<void>;
}
```

**完了条件**:

- `save()` メソッドシグネチャがインターフェースに追加されている
- `packages/domain` 内に他の変更がない（`store.ts` は変更しない）
- `pnpm type-check` がこのステップ単体でエラーなし（`DrizzleStoreRepository` はまだ存在しないが、Domain 層自体はコンパイルできる）

---

### Step 2: Infrastructure スキーマ変更

**対象ファイル**: `packages/infrastructure/src/db/schema.ts`

**現在の内容**: `recipes` テーブルのみ定義（`pgTable`、`text`、`integer`、`jsonb`、`timestamp` をインポート済み）。

**変更内容**: `stores` テーブル定義と型エクスポートを末尾に追記する。

**追記する内容**:

```typescript
export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
```

注意点:

- `timestamp` は既に `drizzle-orm/pg-core` から import されているため追加 import 不要
- `pgTable`、`text` も既存 import に含まれているため追加不要
- `integer`、`jsonb` は Store テーブルでは使用しないが既存 import から削除しない

**完了条件**:

- `stores` テーブル定義が追記されている
- `StoreRow`、`NewStoreRow` 型がエクスポートされている
- `recipes` テーブルの既存定義が変わっていない

---

### Step 3: マイグレーション生成

**実行コマンド**:

```bash
pnpm --filter @cookpit/web db:generate
```

**生成先**: `apps/web/src/db/migrations/` 以下に新しい `.sql` ファイルと `meta/` 更新が出力される。

**生成されるマイグレーションの想定内容**:

```sql
CREATE TABLE "stores" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
```

**完了条件**:

- `apps/web/src/db/migrations/` 以下に新しい `.sql` ファイルが生成されている
- `.sql` の内容に `CREATE TABLE "stores"` が含まれる
- `meta/_journal.json` が更新されている
- `recipes` テーブルに関する ALTER 文が含まれていない（既存テーブルへの影響なし）
- 生成ファイルをコミット対象に含める（削除・手動編集しない）

---

### Step 4: Infrastructure Repository 実装

**対象ファイル（新規）**: `packages/infrastructure/src/repositories/drizzle-store.repository.ts`

**実装内容**:

```typescript
import { eq } from 'drizzle-orm';
import { Store } from '@cookpit/domain/src/shared/store';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { DrizzleClient } from '../db/client';
import { stores, type StoreRow, type NewStoreRow } from '../db/schema';

export class DrizzleStoreRepository implements StoreRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: StoreId): Promise<Store | null> {
    const rows = await this.db.select().from(stores).where(eq(stores.id, id.value)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toEntity(row);
  }

  async findAll(): Promise<Store[]> {
    const rows = await this.db.select().from(stores).orderBy(stores.createdAt);
    return rows.map((row) => this.toEntity(row));
  }

  async save(store: Store): Promise<void> {
    const row = this.toRow(store);
    await this.db
      .insert(stores)
      .values(row)
      .onConflictDoUpdate({
        target: stores.id,
        set: {
          name: row.name,
        },
      });
  }

  private toEntity(row: StoreRow): Store {
    return Store.reconstruct({
      id: StoreId.fromString(row.id),
      name: row.name,
      createdAt: row.createdAt,
    });
  }

  private toRow(store: Store): NewStoreRow {
    return {
      id: store.id.value,
      name: store.name,
      createdAt: store.createdAt,
    };
  }
}
```

注意点:

- `onConflictDoUpdate` の `set` に `createdAt` を含めない（不変フィールドのため）
- `DrizzleRecipeRepository` と同様に `eq` を `drizzle-orm` からインポートする
- `Store` と `StoreId` は同一ファイル (`store.ts`) からインポートする
- `StoreRow`、`NewStoreRow` は `import type` ではなく通常 import でも可だが、`DrizzleRecipeRepository` の `RecipeRow`/`NewRecipeRow` と同様に型インポートで統一する

**対象ファイル（既存変更）**: `packages/infrastructure/src/index.ts`

**変更内容**: 末尾に以下を追記する。

```typescript
export * from './repositories/drizzle-store.repository';
```

**完了条件**:

- `DrizzleStoreRepository` が `StoreRepository` インターフェースを完全に実装している（`findById`、`findAll`、`save` の3メソッドすべて）
- `findAll()` は `ORDER BY created_at ASC` で取得する
- `save()` は upsert（ON CONFLICT DO UPDATE）で `name` のみ更新する
- `DrizzleStoreRepository` が `packages/infrastructure/src/index.ts` からエクスポートされている
- `pnpm type-check` がエラーなし

---

### Step 5: Application 層実装

このステップ内のファイルは依存順に従って上から順に作成する。

#### Step 5-1: DTO 定義

**対象ファイル（新規）**: `packages/application/src/store/store.dto.ts`

**実装内容**:

```typescript
export interface StoreDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateStoreInputDto {
  name: string;
}
```

**完了条件**:

- `StoreDto` が `{ id: string; name: string; createdAt: string }` の構造を持つ
- `CreateStoreInputDto` が `{ name: string }` の構造を持つ

#### Step 5-2: Mapper 実装

**対象ファイル（新規）**: `packages/application/src/store/store.mapper.ts`

**実装内容**:

```typescript
import type { Store } from '@cookpit/domain/src/shared/store';
import type { StoreDto } from './store.dto';

export function toStoreDto(store: Store): StoreDto {
  return {
    id: store.id.value,
    name: store.name,
    createdAt: store.createdAt.toISOString(),
  };
}
```

注意点:

- `store.createdAt` は `Store` エンティティの getter が防御的コピー（`new Date(this.createdDate)`）を返すため、Mapper 側での追加コピーは不要
- `Store` は `import type` で参照する（値としては使用しないため）

**完了条件**:

- `toStoreDto()` が `Store` を受け取り `StoreDto` を返す
- `createdAt` が `store.createdAt.toISOString()` で ISO 8601 文字列（UTC、`Z` サフィックス）に変換される

#### Step 5-3: エラークラス定義

**対象ファイル（新規）**: `packages/application/src/store/store-not-found.error.ts`

**実装内容**:

```typescript
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = 'StoreNotFoundError';
  }
}
```

注意点:

- `RecipeNotFoundError` と同パターン
- 現時点でこのエラーを throw する UseCase は存在しないが、将来用プレースホルダとして定義する（設計書 D-6）

**完了条件**:

- `StoreNotFoundError extends Error` が定義されている
- コンストラクタで `storeId: string` を受け取り `Store not found: ${storeId}` メッセージを設定する
- `this.name` が `'StoreNotFoundError'` に設定されている

#### Step 5-4: GetStoresUseCase 実装

**対象ファイル（新規）**: `packages/application/src/store/get-stores.use-case.ts`

**実装内容**:

```typescript
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

export class GetStoresUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  async execute(): Promise<StoreDto[]> {
    const stores = await this.storeRepository.findAll();
    return stores.map(toStoreDto);
  }
}
```

**完了条件**:

- `execute()` が引数なしで `StoreDto[]` を返す
- `StoreRepository` をコンストラクタで受け取る（手動 DI）
- `GetRecipesUseCase` と同パターン

#### Step 5-5: CreateStoreUseCase 実装

**対象ファイル（新規）**: `packages/application/src/store/create-store.use-case.ts`

**実装内容**:

```typescript
import { Store } from '@cookpit/domain/src/shared/store';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import type { CreateStoreInputDto, StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

export class CreateStoreUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  async execute(input: CreateStoreInputDto): Promise<StoreDto> {
    const store = Store.create({ name: input.name });
    await this.storeRepository.save(store);
    return toStoreDto(store);
  }
}
```

注意点:

- `Store` は値として使用する（`Store.create()` を呼ぶ）ため `import type` ではなく通常 import にする
- `StoreRepository`、`CreateStoreInputDto`、`StoreDto` は `import type` で参照する
- `Store.create()` がドメインバリデーション（name 空チェック）を行う。UseCase は組み立て役に徹する

**完了条件**:

- `execute(input: CreateStoreInputDto): Promise<StoreDto>` が実装されている
- `Store.create()` → `repository.save()` → `toStoreDto()` の順で処理する
- `StoreRepository` をコンストラクタで受け取る（手動 DI）

#### Step 5-6: store/index.ts 作成

**対象ファイル（新規）**: `packages/application/src/store/index.ts`

**実装内容**:

```typescript
export * from './create-store.use-case';
export * from './get-stores.use-case';
export * from './store.dto';
export * from './store-not-found.error';
```

注意点:

- `store.mapper.ts` はここに含めない（UseCase 経由でのみ使用されるため、`recipe/index.ts` と同パターン）

**完了条件**:

- 上記4ファイルが re-export されている
- `store.mapper.ts` は含まれていない

#### Step 5-7: application/src/index.ts 変更

**対象ファイル（既存変更）**: `packages/application/src/index.ts`

**現在の内容**:

```typescript
// application package
export * from './recipe';
```

**変更後の内容**:

```typescript
// application package
export * from './recipe';
export * from './store';
```

**完了条件**:

- `export * from './store'` が追記されている
- `export * from './recipe'` が引き続き存在する
- `pnpm type-check` がエラーなし

---

### Step 6: API Contract 層実装

#### Step 6-1: store.schema.ts 作成

**対象ファイル（新規）**: `packages/api-contract/src/store.schema.ts`

**実装内容**:

```typescript
import z from 'zod';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

export const createStoreSchema = z.object({
  name: nonBlankString,
});

export const storeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export type CreateStoreBody = z.infer<typeof createStoreSchema>;
export type StoreResponse = z.infer<typeof storeResponseSchema>;
```

注意点:

- Zod のインポートは `import z from 'zod'`（デフォルトインポート）を使う。`recipe.schema.ts` と同形式（`import { z } from 'zod'` は使わない）
- `nonBlankString` は `recipe.schema.ts` と同一パターンをローカル定義する（共通化はスコープ外）

**完了条件**:

- `createStoreSchema`、`storeResponseSchema` が定義・エクスポートされている
- `CreateStoreBody`、`StoreResponse` 型がエクスポートされている
- `storeResponseSchema` の構造が `StoreDto`（`{ id: string; name: string; createdAt: string }`）と一致する

#### Step 6-2: api-contract/src/index.ts 変更

**対象ファイル（既存変更）**: `packages/api-contract/src/index.ts`

**現在の内容**:

```typescript
// api-contract package
export * from './recipe.schema';
```

**変更後の内容**:

```typescript
// api-contract package
export * from './recipe.schema';
export * from './store.schema';
```

**完了条件**:

- `export * from './store.schema'` が追記されている
- `export * from './recipe.schema'` が引き続き存在する

---

### Step 7: Presentation 層実装

#### Step 7-1: storesRoute 実装

**対象ファイル（新規）**: `apps/web/src/server/routes/stores.ts`

**実装内容**:

```typescript
import { getDb } from '@/db/client';
import { createStoreSchema } from '@cookpit/api-contract';
import { CreateStoreUseCase, GetStoresUseCase } from '@cookpit/application';
import { DrizzleStoreRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

function storeRepository(): DrizzleStoreRepository {
  return new DrizzleStoreRepository(getDb());
}

export const storesRoute = new Hono()
  .get('/', async (c) => {
    const usecase = new GetStoresUseCase(storeRepository());
    const stores = await usecase.execute();
    return c.json(stores);
  })
  .post('/', zValidator('json', createStoreSchema), async (c) => {
    const body = c.req.valid('json');
    const usecase = new CreateStoreUseCase(storeRepository());
    const store = await usecase.execute(body);
    return c.json(store, 201);
  });
```

注意点:

- `recipes.ts` と同パターンで手動 DI を実施する（`storeRepository()` ファクトリ関数）
- `GET /` は `storeResponseSchema` を明示的に使用しない（UseCase の戻り値型 `StoreDto[]` で型安全を担保）
- `POST /` は `201` を返す（`recipes.ts` と同じ）
- `GET /:id` は定義しない（スコープ外、設計書 D-5）

**完了条件**:

- `GET /`（`GetStoresUseCase`）と `POST /`（`CreateStoreUseCase`）の2エンドポイントが定義されている
- `zValidator('json', createStoreSchema)` が `POST /` に適用されている
- `POST /` のレスポンスが `201` である
- `storesRoute` が名前付きエクスポートされている

#### Step 7-2: app.ts 変更

**対象ファイル（既存変更）**: `apps/web/src/server/app.ts`

**現在の内容**:

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

**変更後の内容**:

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { storesRoute } from './routes/stores';
import { RecipeNotFoundError } from '@cookpit/application';
import { StoreNotFoundError } from '@cookpit/application';
const app = new Hono().basePath('/api');

const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/stores', storesRoute);

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
export type AppType = typeof routes;
export default app;
```

注意点:

- 既存の `RecipeNotFoundError` 分岐を壊さない
- `StoreNotFoundError` の分岐は `RecipeNotFoundError` の後に追加する
- `const routes = ...` を複数行に展開するが、既存の `.route('/health', healthRoute).route('/recipes', recipesRoute)` の結果は変わらない
- `AppType` は `routes` から型推論されるため、`storesRoute` 追加により自動的に更新される

**完了条件**:

- `storesRoute` が `/stores` にマウントされている（`basePath('/api')` により `/api/stores` になる）
- `StoreNotFoundError` の `onError` 分岐が追加されている
- 既存の `RecipeNotFoundError` 分岐が変わっていない
- `export type AppType = typeof routes` が維持されている

---

### Step 8: テスト実装

**対象ファイル（新規）**: `packages/application/src/store/store-use-cases.test.ts`

Recipe 先例（`packages/application/src/recipe/recipe-use-cases.test.ts`）に倣い、インメモリ Repository を使ったユニットテストを実装する。

**テスト構造**:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '@cookpit/domain/src/shared/store';
import { StoreId } from '@cookpit/domain/src/shared/store';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import { CreateStoreUseCase } from './create-store.use-case';
import { GetStoresUseCase } from './get-stores.use-case';

class InMemoryStoreRepository implements StoreRepository {
  private readonly map = new Map<string, Store>();
  public saveCount = 0;

  async findById(id: StoreId): Promise<Store | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Store[]> {
    return [...this.map.values()];
  }

  async save(store: Store): Promise<void> {
    this.saveCount += 1;
    this.map.set(store.id.value, store);
  }

  seed(store: Store): void {
    this.map.set(store.id.value, store);
  }

  get size(): number {
    return this.map.size;
  }
}
```

**テストケース（設計書 §17-2 に対応）**:

| テスト ID | describe             | ケース                      | 検証内容                                                      |
| --------- | -------------------- | --------------------------- | ------------------------------------------------------------- |
| N-01      | `CreateStoreUseCase` | `execute({ name: "西友" })` | `StoreDto` が返り、`saveCount === 1`                          |
| E-01      | `CreateStoreUseCase` | `execute({ name: "" })`     | `Error('Store name is required')` が throw、`saveCount === 0` |
| E-02      | `CreateStoreUseCase` | `execute({ name: "  " })`   | 同上（空白のみ）                                              |
| N-03      | `GetStoresUseCase`   | 0件の場合                   | 空配列を返す                                                  |
| N-04      | `GetStoresUseCase`   | 複数件の場合                | 全件を `StoreDto[]` で返す                                    |

**完了条件**:

- 上記5ケースがすべて `vitest` で通る
- `packages/domain/src/shared/store.test.ts`（既存）が引き続き通る

**対象ファイル（新規）**: `packages/application/src/store/store.mapper.test.ts`

```
N-05 の Mapper テスト: toStoreDto() の全フィールド変換を検証
- id が store.id.value と一致する
- name が store.name と一致する
- createdAt が ISO 8601 文字列（`Z` サフィックス）である
```

**完了条件**:

- `toStoreDto()` のテストが通る
- `createdAt` が `.toISOString()` の形式（例: `'2026-01-01T00:00:00.000Z'`）であることを検証する

---

### Step 9: 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
```

**完了条件**:

- `pnpm lint` がエラーなし
- `pnpm type-check` がエラーなし
- `pnpm test` が全テスト通過（新規 Store テストを含む、既存 Recipe テストへの影響なし）

---

## 実装順序サマリ

```
Step 1: E-1  packages/domain/src/shared/store.repository.ts（save() 追加）
Step 2: E-2  packages/infrastructure/src/db/schema.ts（stores テーブル追記）
Step 3: N-10 マイグレーション生成（pnpm --filter @cookpit/web db:generate）
Step 4: N-1  packages/infrastructure/src/repositories/drizzle-store.repository.ts（新規）
        E-3  packages/infrastructure/src/index.ts（エクスポート追加）
Step 5: N-2  packages/application/src/store/store.dto.ts（新規）
        N-3  packages/application/src/store/store.mapper.ts（新規）
        N-4  packages/application/src/store/store-not-found.error.ts（新規）
        N-5  packages/application/src/store/get-stores.use-case.ts（新規）
        N-6  packages/application/src/store/create-store.use-case.ts（新規）
        N-7  packages/application/src/store/index.ts（新規）
        E-4  packages/application/src/index.ts（エクスポート追加）
Step 6: N-8  packages/api-contract/src/store.schema.ts（新規）
        E-5  packages/api-contract/src/index.ts（エクスポート追加）
Step 7: N-9  apps/web/src/server/routes/stores.ts（新規）
        E-6  apps/web/src/server/app.ts（マウント・ハンドリング追加）
Step 8: テスト実装（store-use-cases.test.ts、store.mapper.test.ts）
Step 9: 品質ゲート（lint / type-check / test）
```

---

## 依存関係グラフ

```
Step 1（Domain）
  └─→ Step 2（Infrastructure schema）
        └─→ Step 3（Migration generate）※ schema 変更直後に実行
              └─→ Step 4（Infrastructure repository + index）
                    └─→ Step 5（Application: DTO → Mapper → Error → UseCase → index）
                          └─→ Step 6（API Contract: schema → index）
                                └─→ Step 7（Presentation: routes → app.ts）
                                      └─→ Step 8（テスト）
                                            └─→ Step 9（品質ゲート）
```

Step 4 は Step 3 のマイグレーション生成完了後に行う（schema 整合のため）。
Step 5 内のファイルは dto → mapper → error → use-cases → index の順に作成する（後続ファイルが前のファイルに依存するため）。

---

## リスク

| #   | リスク                                                                                             | 影響                        | 対策                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| R-1 | `pnpm --filter @cookpit/web db:generate` が既存マイグレーションと競合する                          | マイグレーション破損        | 生成後に SQL 内容を確認し、`recipes` テーブルへの変更が含まれていないことを検証する |
| R-2 | `DrizzleStoreRepository.save()` の `onConflictDoUpdate` に `createdAt` を誤って含める              | 作成日時が上書きされる      | `set` に `name` のみを指定していることを確認する                                    |
| R-3 | `app.ts` の既存 `RecipeNotFoundError` 分岐を誤って削除・変更する                                   | Recipe 404 が機能しなくなる | 変更前後で `RecipeNotFoundError` 分岐の存在をファイル diff で確認する               |
| R-4 | `StoreRepository` インターフェースへの `save()` 追加により、テスト用インメモリ実装が型エラーになる | テスト実装時に型エラー      | Step 8 で `InMemoryStoreRepository` に `save()` を実装する                          |

---

## ロールバック方法

各ステップは独立してリバートできる。

1. Step 1（Domain）: `store.repository.ts` を変更前に戻す。`DrizzleStoreRepository` が存在しない場合は型エラーになるが、Step 4 と同時に戻せば整合する。
2. Step 2-3（Infrastructure schema + Migration）: `schema.ts` から `stores` 定義を削除し、生成されたマイグレーションファイルを削除する。DB にマイグレーション適用済みの場合は `DROP TABLE stores` が必要。
3. Step 4（Infrastructure repository）: `drizzle-store.repository.ts` を削除し、`infrastructure/src/index.ts` のエクスポート行を削除する。
4. Step 5（Application）: `packages/application/src/store/` ディレクトリを削除し、`application/src/index.ts` の `export * from './store'` を削除する。
5. Step 6（API Contract）: `store.schema.ts` を削除し、`api-contract/src/index.ts` の追記行を削除する。
6. Step 7（Presentation）: `routes/stores.ts` を削除し、`app.ts` への3か所の変更（import 2行 + route 追加 + onError 分岐）を元に戻す。

---

## ドキュメント更新箇所

本実装計画の完了後、以下の更新が必要。

- `docs/designs/store-master.md`: ステータスを `confirmed` から `implemented` に変更する（実装完了後）
- `docs/05-roadmap.md`: Sprint 2 Unit A の該当タスクを完了マークに更新する（実装完了後）
- `docs/04-domain-model.md`: `StoreRepository` インターフェースに `save()` が追加されたことを反映する（必要に応じて）

---

## 手動テスト観点（実装後の動作確認）

設計書 §17-3 に定義された API 層の手動テスト観点。

| #    | ケース                           | 手順                                                                                                     | 期待結果                                                    |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| N-06 | `POST /api/stores` 正常系        | `curl -X POST http://localhost:3000/api/stores -H 'Content-Type: application/json' -d '{"name":"西友"}'` | 201 + `{ id: "...", name: "西友", createdAt: "..." }`       |
| N-07 | `GET /api/stores` 正常系         | `curl http://localhost:3000/api/stores`                                                                  | 200 + `[{ id: "...", name: "西友", createdAt: "..." }]`     |
| E-03 | `POST /api/stores` name 空文字   | `curl -X POST ... -d '{"name":""}'`                                                                      | 400                                                         |
| E-04 | `POST /api/stores` name キーなし | `curl -X POST ... -d '{}'`                                                                               | 400                                                         |
| B-01 | `POST /api/stores` name 1文字    | `curl -X POST ... -d '{"name":"西"}'`                                                                    | 201 + `StoreDto`                                            |
| B-03 | 同名 Store の重複登録            | 同じ `name` で2回 POST                                                                                   | 2件とも 201 + 異なる `id` の `StoreDto`（ユニーク制約なし） |
