# 設計書: store-master

- ステータス: confirmed
- レベル: L3
- 関連: `docs/requirements/store-master.md`（要件定義）、`docs/04-domain-model.md`、`docs/03-architecture.md`

---

## 1. 目的

Sprint 2 Unit A として Store マスタの全層縦スライスを実装する。既存の Recipe 縦スライスを
踏襲対象とし、以下の層を追加する。

| 層 | 実装対象 |
|---|---|
| Domain | `StoreRepository` インターフェースに `save()` を追加（最小変更） |
| Infrastructure | `stores` テーブル（Drizzle スキーマ + マイグレーション）、`DrizzleStoreRepository` |
| Application | `GetStoresUseCase`、`CreateStoreUseCase`、`StoreDto`、`StoreMapper`、`StoreNotFoundError` |
| API Contract | `createStoreSchema`、`storeResponseSchema` |
| Presentation (API) | `GET /api/stores`、`POST /api/stores`、`app.ts` へのマウント |

画面（一覧・作成 UI）はスコープ外。`GetStoreUseCase`（単件）、update/delete UseCase もスコープ外。

---

## 2. 確定済み設計判断（変更不可）

Orchestrator により以下の判断が確定している。設計書はこの判断に従って記述する。

| # | 判断項目 | 確定内容 |
|---|---|---|
| D-1 | `storeResponseSchema` の配置 | `packages/api-contract/src/store.schema.ts` に `createStoreSchema` と `storeResponseSchema` の両方を定義する |
| D-2 | `StoreDto` の構造 | `{ id: string; name: string; createdAt: string }` を保ち、`storeResponseSchema` の `z.infer` 型と構造一致させる（値の整合は Mapper が担保） |
| D-3 | `stores.name` のユニーク制約 | 付けない（`id text PK` のみ。スコープ外） |
| D-4 | `DrizzleStoreRepository.save()` | `INSERT ... ON CONFLICT (id) DO UPDATE SET name = ...` の upsert（Recipe 先例に合わせる） |
| D-5 | `GetStoreUseCase`（単件） | 今回スコープに含めない（`/api/stores/:id` ルートなし） |
| D-6 | `StoreNotFoundError` | `packages/application/src/store/store-not-found.error.ts` に定義し index からエクスポートする（現使用箇所はないが将来の単件取得・更新で使う前提のプレースホルダ） |

---

## 3. 変更後構成

### 3-1. 変更ファイル（既存ファイルへの追記）

| ファイル | 変更内容 |
|---|---|
| `packages/domain/src/shared/store.repository.ts` | `save(store: Store): Promise<void>` を追加 |
| `packages/infrastructure/src/db/schema.ts` | `stores` テーブル定義を追記 |
| `packages/infrastructure/src/index.ts` | `DrizzleStoreRepository` のエクスポートを追加 |
| `packages/application/src/index.ts` | `export * from './store'` を追加 |
| `packages/api-contract/src/index.ts` | `export * from './store.schema'` を追加 |
| `apps/web/src/server/app.ts` | `storesRoute` のマウント、`StoreNotFoundError` の `onError` ハンドリング追加 |

### 3-2. 新規作成ファイル

| ファイル | 内容 |
|---|---|
| `packages/application/src/store/store.dto.ts` | `StoreDto`、`CreateStoreInputDto` |
| `packages/application/src/store/store.mapper.ts` | `toStoreDto(store: Store): StoreDto` |
| `packages/application/src/store/store-not-found.error.ts` | `StoreNotFoundError extends Error` |
| `packages/application/src/store/get-stores.use-case.ts` | `GetStoresUseCase` |
| `packages/application/src/store/create-store.use-case.ts` | `CreateStoreUseCase` |
| `packages/application/src/store/index.ts` | バレルエクスポート |
| `packages/infrastructure/src/repositories/drizzle-store.repository.ts` | `DrizzleStoreRepository implements StoreRepository` |
| `packages/api-contract/src/store.schema.ts` | `createStoreSchema`、`storeResponseSchema` |
| `apps/web/src/server/routes/stores.ts` | `storesRoute`（Hono） |
| `apps/web/src/db/migrations/` 以下 | Drizzle 生成マイグレーションファイル（コマンドで自動生成） |

### 3-3. 変更なし・スコープ外

- `packages/domain/src/shared/store.ts`（`Store` エンティティ自体は変更なし）
- `apps/web/src/server/routes/recipes.ts`（変更なし）
- Recipe 集約の全ファイル（変更なし）

### 3-4. 依存関係

```
apps/web/src/server/app.ts
  └─→ apps/web/src/server/routes/stores.ts
        ├─→ @cookpit/application (GetStoresUseCase, CreateStoreUseCase, StoreNotFoundError)
        ├─→ @cookpit/infrastructure (DrizzleStoreRepository)
        ├─→ @cookpit/api-contract (createStoreSchema)
        └─→ @/db/client (getDb)

packages/application/src/store/*
  └─→ @cookpit/domain/src/shared/store.ts
  └─→ @cookpit/domain/src/shared/store.repository.ts

packages/infrastructure/src/repositories/drizzle-store.repository.ts
  ├─→ @cookpit/domain/src/shared/store.ts
  ├─→ @cookpit/domain/src/shared/store.repository.ts
  └─→ packages/infrastructure/src/db/schema.ts
```

---

## 4. Domain 層

### 4-1. `StoreRepository` インターフェース（変更のみ）

**ファイル**: `packages/domain/src/shared/store.repository.ts`

既存の `findById` / `findAll` に `save` を追加する。

```typescript
import type { Store, StoreId } from './store';

export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
  save(store: Store): Promise<void>;   // 追加
}
```

**設計根拠**: UseCase は Repository インターフェースに依存する（DIP）。`save()` がなければ
`CreateStoreUseCase` が永続化を呼べない。インターフェース名は `StoreRepository`（`I` プレフィックスなし）を維持する。

### 4-2. `Store` エンティティ（変更なし）

`packages/domain/src/shared/store.ts` に実装済みのエンティティをそのまま使用する。

| メソッド/プロパティ | 型 | 説明 |
|---|---|---|
| `Store.create(input: StoreCreateInput)` | `Store` | 新規生成（UUID 採番 + name 空チェック）。`name.trim() === ''` で `Error('Store name is required')` を throw |
| `Store.reconstruct(props: StoreProps)` | `Store` | DB 復元（初期化ロジックを通さない） |
| `store.id` | `StoreId` | getter |
| `store.name` | `string` | getter |
| `store.createdAt` | `Date` | getter（防御的コピー `new Date(this.createdDate)` 済み） |

---

## 5. Infrastructure 層

### 5-1. DB スキーマ

**ファイル**: `packages/infrastructure/src/db/schema.ts`（追記）

```typescript
export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
```

**設計根拠**:
- `id`: `StoreId.value`（UUID 文字列）を `text` 型として格納する（Recipe の `id: text PK` と同パターン）
- `name`: `NOT NULL`。ユニーク制約は付けない（D-3）
- `created_at`: `timestamp NOT NULL DEFAULT now()`。Store は今回スコープでは更新操作がないため `updated_at` は不要
- `recipes` テーブルと同一ファイルに追記する（既存パターン踏襲）

### 5-2. `DrizzleStoreRepository`

**ファイル**: `packages/infrastructure/src/repositories/drizzle-store.repository.ts`

クラスシグネチャと各メソッドの仕様:

```
DrizzleStoreRepository implements StoreRepository
  constructor(private readonly db: DrizzleClient)

  findById(id: StoreId): Promise<Store | null>
    → SELECT FROM stores WHERE id = id.value LIMIT 1
    → row が存在しない場合: null を返す
    → Store.reconstruct({ id: StoreId.fromString(row.id), name: row.name, createdAt: row.createdAt })

  findAll(): Promise<Store[]>
    → SELECT FROM stores ORDER BY created_at ASC
    → rows.map(row => toEntity(row))

  save(store: Store): Promise<void>
    → INSERT INTO stores VALUES (toRow(store))
      ON CONFLICT (id) DO UPDATE SET name = row.name
    → createdAt は UPDATE 対象外（不変）

  private toEntity(row: StoreRow): Store
    → Store.reconstruct({ id: StoreId.fromString(row.id), name: row.name, createdAt: row.createdAt })

  private toRow(store: Store): NewStoreRow
    → { id: store.id.value, name: store.name, createdAt: store.createdAt }
```

**設計根拠（D-4）**:
- `save()` は `INSERT ... ON CONFLICT (id) DO UPDATE SET name = ...` の upsert
- `DrizzleRecipeRepository.save()` パターンを踏襲し、対象カラムを明示的に指定する
- DB スキーマ形 ⇔ ドメインモデル形の変換責任は Repository が持つ（`toEntity` / `toRow` の private メソッド）
- Domain 層は DB の形（`StoreRow` 型）を知らない

### 5-3. `packages/infrastructure/src/index.ts` への追記

```typescript
export * from './db/schema';
export * from './db/client';
export * from './repositories/drizzle-recipe.repository';
export * from './repositories/drizzle-store.repository';  // 追加
```

---

## 6. Application 層

### 6-1. `StoreDto` と `CreateStoreInputDto`

**ファイル**: `packages/application/src/store/store.dto.ts`

```typescript
export interface StoreDto {
  id: string;
  name: string;
  createdAt: string;  // ISO 8601 文字列
}

export interface CreateStoreInputDto {
  name: string;
}
```

**設計根拠（D-2）**: `StoreDto` の構造は `{ id: string; name: string; createdAt: string }` で固定する。
`storeResponseSchema`（api-contract 層）の `z.infer` 型と構造一致させることで、レイヤー間の型整合を確保する。
値の整合（`Date → ISO 8601 string` の変換）は Mapper が担保する。

### 6-2. `StoreMapper`

**ファイル**: `packages/application/src/store/store.mapper.ts`

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

**変換規則**:

| Domain フィールド | 型 | DTO フィールド | 型 | 変換ルール |
|---|---|---|---|---|
| `store.id.value` | `string` | `id` | `string` | そのまま |
| `store.name` | `string` | `name` | `string` | そのまま |
| `store.createdAt` | `Date` | `createdAt` | `string` | `.toISOString()` で ISO 8601 文字列（UTC、`Z` サフィックス）に変換 |

**設計根拠**: `Date` を ISO 8601 文字列に変換するパターンは `toRecipeDto`（`recipe.createdAt.toISOString()`）と同じ。
`Store.createdAt` getter は防御的コピー（`new Date(this.createdDate)`）を返すため、Mapper 側での追加コピーは不要。

### 6-3. `GetStoresUseCase`

**ファイル**: `packages/application/src/store/get-stores.use-case.ts`

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

**設計根拠**: `GetRecipesUseCase` と同パターン。引数なしで全件取得し、Mapper で DTO に変換する。

### 6-4. `CreateStoreUseCase`

**ファイル**: `packages/application/src/store/create-store.use-case.ts`

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

**設計根拠**:
- `Store.create()` がドメインバリデーション（name 空チェック）を担う。UseCase は組み立て役に徹する
- `CreateRecipeUseCase` と同パターン（`Recipe.create()` → `save()` → `toRecipeDto()`）
- `StoreNotFoundError` はこの UseCase では使用しない（`save` のみのため存在チェック不要）
- 手動 DI: コンストラクタで `StoreRepository` を受け取る

### 6-5. `StoreNotFoundError`

**ファイル**: `packages/application/src/store/store-not-found.error.ts`

```typescript
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = 'StoreNotFoundError';
  }
}
```

**設計根拠（D-6）**: `RecipeNotFoundError` と同パターン。現時点でこのエラーを throw する UseCase は
存在しないが、将来の単件取得・更新 UseCase で使用する前提のプレースホルダとして定義する。
`app.ts` の `onError` には今回登録する（§8-2 参照）。

### 6-6. `packages/application/src/store/index.ts`

```typescript
export * from './create-store.use-case';
export * from './get-stores.use-case';
export * from './store.dto';
export * from './store-not-found.error';
```

**設計根拠**: `packages/application/src/recipe/index.ts` と同パターン。`store.mapper.ts` は
UseCase・外部から直接使用されない想定のため index からの再エクスポートは不要。

### 6-7. `packages/application/src/index.ts` への追記

```typescript
export * from './recipe';
export * from './store';  // 追加
```

---

## 7. API Contract 層

### 7-1. `store.schema.ts`

**ファイル**: `packages/api-contract/src/store.schema.ts`

```typescript
import { z } from 'zod';

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

**設計根拠（D-1・D-2 の実現）**:
- `createStoreSchema`: `POST /api/stores` のリクエストボディバリデーションに使用する
- `storeResponseSchema`（D-1）: レスポンス型を Zod スキーマとして `api-contract` に定義する。
  `StoreResponse`（`z.infer<typeof storeResponseSchema>`）は `StoreDto`（Application 層）と
  `{ id: string; name: string; createdAt: string }` で構造一致する（D-2）
- フロントエンドが将来 `StoreResponse` 型を `import type` で参照できることを前提としている
- `nonBlankString` は `recipe.schema.ts` と同一パターンをローカル定義する
  （共通化のリファクタリングはスコープ外）

### 7-2. `packages/api-contract/src/index.ts` への追記

```typescript
export * from './recipe.schema';
export * from './store.schema';  // 追加
```

---

## 8. Presentation (API) 層

### 8-1. `storesRoute`

**ファイル**: `apps/web/src/server/routes/stores.ts`

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

**エンドポイント仕様**:

| メソッド | パス | UseCase | 成功レスポンス | バリデーション |
|---|---|---|---|---|
| `GET` | `/api/stores` | `GetStoresUseCase` | 200 + `StoreDto[]` | なし |
| `POST` | `/api/stores` | `CreateStoreUseCase` | 201 + `StoreDto` | `createStoreSchema`（Zod） |

**設計根拠**:
- `recipes.ts` と同パターンで手動 DI を実施する（`storeRepository()` ファクトリ関数）
- `GET /api/stores/:id` はスコープ外のため、`id` パラメータルートは定義しない（D-5）
- `POST /` のレスポンスは `201`（Created）とする（`recipes.ts` の `POST /` と同じ）
- `storeResponseSchema` は Hono ルートで明示的に使用しない。UseCase が `StoreDto` を返し、
  Hono が JSON シリアライズする。型安全は Application 層の戻り値型で担保する

### 8-2. `app.ts` への変更

**ファイル**: `apps/web/src/server/app.ts`（追記）

変更点:

1. `import { storesRoute } from './routes/stores'` を追加
2. `import { StoreNotFoundError } from '@cookpit/application'` を追加
3. `const routes = ...` のメソッドチェーンに `.route('/stores', storesRoute)` を追加
4. `app.onError` 内に `if (err instanceof StoreNotFoundError)` 分岐を追加

変更後の `app.ts` 全体イメージ:

```typescript
import { Hono } from 'hono';
import { healthRoute } from './routes/health';
import { recipesRoute } from './routes/recipes';
import { storesRoute } from './routes/stores';              // 追加
import { RecipeNotFoundError } from '@cookpit/application';
import { StoreNotFoundError } from '@cookpit/application';  // 追加

const app = new Hono().basePath('/api');

const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/stores', storesRoute);  // 追加

app.onError((err, c) => {
  if (err instanceof RecipeNotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof StoreNotFoundError) {       // 追加
    return c.json({ error: err.message }, 404);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof routes;
export default app;
```

**設計根拠**:
- 既存の `RecipeNotFoundError` 分岐を壊さない。`StoreNotFoundError` の分岐を後続に追加するだけ
- `AppType` は `routes` から型推論されるため、`storesRoute` の追加により自動的に更新される
- `storesRoute` は `/api/stores` にマウントされる（`basePath('/api')` + `.route('/stores', storesRoute)`）

---

## 9. データフロー

### 9-1. `GET /api/stores`

```
HTTP GET /api/stores
  → apps/web/src/server/routes/stores.ts (storesRoute.get('/'))
      → GetStoresUseCase.execute()  [手動 DI: DrizzleStoreRepository(getDb())]
          → DrizzleStoreRepository.findAll()
              → SELECT id, name, created_at FROM stores ORDER BY created_at ASC
              → rows.map(toEntity)     [StoreRow → Store.reconstruct()]
          → stores.map(toStoreDto)     [Store → StoreDto]
      → c.json(StoreDto[])
← 200 JSON StoreDto[]
```

### 9-2. `POST /api/stores`

```
HTTP POST /api/stores  body: { name: string }
  → zValidator('json', createStoreSchema)
      → バリデーション失敗（name 未指定・空文字・空白のみ）: 400 Bad Request（自動）
      → 成功: c.req.valid('json') = CreateStoreBody
  → apps/web/src/server/routes/stores.ts (storesRoute.post('/'))
      → CreateStoreUseCase.execute({ name })  [手動 DI]
          → Store.create({ name })
              → name.trim() === '' → Error('Store name is required')
                （Zod が先に弾くため通常は到達しない）
              → 成功: Store インスタンス（StoreId.generate() で UUID 採番）
          → DrizzleStoreRepository.save(store)
              → INSERT INTO stores ... ON CONFLICT (id) DO UPDATE SET name = ...
          → toStoreDto(store)   [Store → StoreDto]
      → c.json(StoreDto, 201)
← 201 JSON StoreDto
```

---

## 10. エラー処理

| エラー種別 | 発生箇所 | HTTP ステータス | 処理方法 |
|---|---|---|---|
| Zod バリデーションエラー（`name` 未指定・空文字・空白のみ） | `storesRoute` の `zValidator` | 400 | `@hono/zod-validator` が自動で 400 を返す |
| ドメインバリデーション違反（`name` 空文字・空白のみ） | `Store.create()` → UseCase | 500 | `app.ts` の `onError` がキャッチして 500。Zod が先に弾くため通常は到達しない |
| `StoreNotFoundError` | 将来の UseCase（現時点では未使用） | 404 | `app.ts` の `onError` で `StoreNotFoundError` → `{ error: message }` 404 |
| DB 接続エラー | `DrizzleStoreRepository` | 500 | `app.ts` の `onError` が `console.error` + 500 |
| `RecipeNotFoundError`（既存） | 既存 UseCase | 404 | 変更なし。既存分岐を壊さない |

**エラーハンドリングの原則**: UseCase の入口（ドメイン境界）でハンドリングする。内部では
例外をそのまま投げ、`app.ts` の `onError` で HTTP レスポンスに変換する（既存パターン踏襲）。

---

## 11. マイグレーション

### 11-1. マイグレーション生成コマンド

`apps/web/drizzle.config.ts` の設定（確認済み）:

```
schema: '../../packages/infrastructure/src/db/schema.ts'
out:    './src/db/migrations'
```

`packages/infrastructure/src/db/schema.ts` に `stores` テーブル定義を追記した後に実行する:

```bash
pnpm --filter @cookpit/web db:generate
```

生成されたマイグレーションファイルは `apps/web/src/db/migrations/` 以下に出力される。
生成ファイルをコミットに含めること。

### 11-2. マイグレーション内容

生成される DDL の想定:

```sql
CREATE TABLE "stores" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
```

**既存テーブルへの影響なし**: `recipes` テーブルは変更しない。

---

## 12. ログと監視

対象外（MVP1 では監視基盤なし）。サーバー側エラーは `console.error` が `app.ts` の
`onError` で既に実装されている（既存パターン踏襲）。

---

## 13. セキュリティ

MVP1 は認証なし（ADR-003 準拠、既存の Recipe 機能と同一前提）。URL を知っていれば
誰でも操作可能。Phase 2 で認証導入時に再検討する。

入力値は `createStoreSchema`（Zod）によりサーバー側でバリデーションされる。`name` は
`nonBlankString` 制約により空文字・空白のみを拒否する。

---

## 14. 性能

MVP1 の2名利用では Store 数は数件〜数十件規模となり性能問題は生じない。`findAll()` は
`ORDER BY created_at` の全件取得で十分。インデックスの追加は不要。

---

## 15. 後方互換性

- 既存の `recipes` テーブル・Recipe 集約・Hono ルート（`/api/recipes`）への変更は一切行わない
- `app.ts` への `StoreNotFoundError` 追加は既存の `RecipeNotFoundError` ハンドリングに
  影響しない（条件分岐の追加のみ）
- `AppType` への `storesRoute` 追加は型の追加のみであり、既存の Hono RPC クライアント型
  (`client.recipes.*`) に影響しない
- `packages/application/src/index.ts` / `packages/infrastructure/src/index.ts` /
  `packages/api-contract/src/index.ts` への re-export 追加は後方互換
- `StoreRepository` インターフェースへの `save()` 追加は既存の実装クラスが存在する場合に
  型エラーになるが、現時点で `DrizzleStoreRepository` は存在しない（本設計で新規作成）

---

## 16. 移行とリリース

1. `packages/infrastructure/src/db/schema.ts` に `stores` テーブル定義を追記する
2. `pnpm --filter @cookpit/web db:generate` でマイグレーションを生成する
3. 生成ファイル（`apps/web/src/db/migrations/` 以下）を確認・コミットする
4. デプロイ後、Neon（PostgreSQL）に対してマイグレーションを実行する
5. 既存の `recipes` テーブルへの変更はないため、Recipe 機能への影響なし

Store シードは今回スコープ外（`product-master` Sprint の責務）。

---

## 17. テスト方針

### 17-1. Domain 層（変更なし）

`Store` エンティティ自体は変更しないため、既存テストはそのまま通る。
`StoreRepository` インターフェースへの `save()` 追加は Interface 定義のみのため、
Domain 層のユニットテスト追加は不要。

### 17-2. Application 層（優先テスト対象）

Application / Infrastructure 層の自動テストは後続フェーズで整備する方針（coding-standards.md 準拠）。
以下が優先テスト対象となる。実装時に Vitest で追加する。

| 対象 | ケース | 観点 |
|---|---|---|
| `CreateStoreUseCase` | `execute({ name: "西友" })` | `StoreDto` が返り、`repository.save()` が1回呼ばれる（N-01） |
| `CreateStoreUseCase` | `execute({ name: "" })` | `Error('Store name is required')` が throw され `saveCount === 0`（E-01/E-06） |
| `CreateStoreUseCase` | `execute({ name: "  " })` | 同上（E-02） |
| `GetStoresUseCase` | 0件の場合 | 空配列を返す（N-03） |
| `GetStoresUseCase` | 複数件の場合 | 全件を `StoreDto[]` で返す（N-04） |
| `toStoreDto` Mapper | 全フィールド変換 | `createdAt` が ISO 8601 文字列（`Z` サフィックス）（N-05） |

### 17-3. API 層（手動テスト観点）

| # | ケース | 期待結果 |
|---|---|---|
| N-06 | `POST /api/stores` — 正常なリクエストボディ `{ "name": "西友" }` | 201 + `StoreDto` |
| N-07 | `GET /api/stores` — 正常 | 200 + `StoreDto[]` |
| E-03 | `POST /api/stores` に `name` が空文字 `""` | 400 |
| E-04 | `POST /api/stores` に `name` キーなし `{}` | 400 |
| B-01 | `name` が1文字 | 201 + `StoreDto` |
| B-03 | 同名 Store の重複登録 | ユニーク制約なしのため別 ID で2件作成される |

---

## 18. Recipe 先例との構造的差分

| 観点 | Recipe | Store（今回） |
|---|---|---|
| エンティティの複雑さ | 複数の値オブジェクト（RecipeIngredient, CookingStep 等） | シンプル（id, name, createdAt のみ） |
| Repository メソッド数 | 4（findById, findAll, save, delete） | 3（findById, findAll, save）※ delete なし |
| UseCase 数 | 5（CRUD） | 2（GetAll, Create）※ スコープ限定 |
| `save()` の ON CONFLICT 更新対象 | name, baseServings, cookingTime, tags, notes, ingredients, steps, updatedAt | name のみ |
| Mapper の複雑さ | ネスト構造（ingredients/steps）のマッピングが複雑 | フラット（id, name, createdAt → string 変換のみ） |
| DB カラム型 | jsonb（ingredients/steps） | text のみ |
| `updatedAt` カラム | あり（update UseCase が存在する） | なし（Store は今回 create のみ） |
| api-contract のスキーマ | createRecipeSchema + updateRecipeSchema（レスポンスは application 層のみ） | createStoreSchema + storeResponseSchema（両方を api-contract に定義。D-1） |
