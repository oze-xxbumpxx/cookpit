# 要求メモ: Store マスタ（Unit A — 全層フルスタック）

作成日: 2026-06-28
担当工程: 要求分析
変更レベル: L3（Domain/Application/Infrastructure/API-Contract/Presentation の全層にまたがる）

---

## 1. 要求の要約

Sprint 2 Unit A として Store マスタの全層縦スライスを実装する。
既存の Recipe 縦スライスを正確な踏襲対象とし、同一パターンで以下を追加する。

| 層 | 実装対象 |
|---|---|
| Domain | `StoreRepository` インターフェースに `save()` を追加（最小変更） |
| Infrastructure | `stores` テーブル（Drizzle スキーマ + マイグレーション）、`DrizzleStoreRepository` |
| Application | `GetStoresUseCase`、`CreateStoreUseCase`、`StoreDto`、`StoreMapper`、`StoreNotFoundError` |
| API Contract | `createStoreSchema`、`storeResponseSchema` |
| Presentation (API) | `GET /api/stores`、`POST /api/stores`、`app.ts` へのマウント |

画面（一覧・作成 UI）はスコープ外。

---

## 2. 確定済みの前提・制約

### ドメイン層
- `packages/domain/src/shared/store.ts` に `Store` エンティティと `StoreId` 値オブジェクトが実装済み。
  - `Store.create(input: StoreCreateInput)` — 新規生成（名前空チェック込み）
  - `Store.reconstruct(props: StoreProps)` — DB 復元
  - 公開 getter: `id: StoreId`、`name: string`、`createdAt: Date`
- `packages/domain/src/shared/store.repository.ts` に `StoreRepository` インターフェース（`findById` / `findAll`）が存在する。
- **承認済み変更**: `save(store: Store): Promise<void>` をこのインターフェースに追加する（1メソッドのみ）。
- インターフェース名は `StoreRepository`（`I` プレフィックスなし）を維持。

### DB スキーマ
- テーブル名: `stores`
- カラム: `id text PK`、`name text NOT NULL`、`created_at timestamp NOT NULL DEFAULT now()`
- 既存 `recipes` テーブルの `schema.ts` と同一ファイル（`packages/infrastructure/src/db/schema.ts`）に追記。
- マイグレーション: `pnpm --filter @cookpit/web db:generate` で生成。

### Application 層の DTO
- `StoreDto` は `{ id: string; name: string; createdAt: string }` の平坦構造（ISO 8601 文字列）。
- Recipe の DTO/Mapper/Error パターンを踏襲する。

### API
- `GET /api/stores` — 全件取得、200 + `StoreDto[]`
- `POST /api/stores` — 新規作成、201 + `StoreDto`
- エラーハンドリングは `app.ts` の `onError` に `StoreNotFoundError` を追加する形で対応。

### アーキテクチャルール（変更不可）
- Domain 層は他パッケージに依存しない。
- `any` 禁止、default export 禁止、`import type` の徹底。
- UseCase = 1 クラス・`execute()` のみ、手動 DI。

---

## 3. 不明点・要確認事項

調査の結果、実装上の判断が必要な事項を以下に挙げる。
いずれもスコープ確認済み方針から演繹できるが、実装者が迷わないよう明示する。

### 3-1. `GetStoresUseCase` に `findById` は不要か
`GET /api/stores/:id` は今回スコープ外とされているため、`GetStoreUseCase`（単件取得）は作らない。
`StoreNotFoundError` は `CreateStoreUseCase` では現時点では使われない（save 呼び出しのみ）。
ただし、`index.ts` からエクスポートはしておくべきか確認が望ましい。
→ **Recipe 先例に合わせてエクスポートする方向で問題ないが、設計者が確認のこと。**

### 3-2. `POST /api/stores` の idempotency
`DrizzleRecipeRepository.save()` は `INSERT ... ON CONFLICT DO UPDATE` を使用している。
Store の `name` はユニーク制約を設けるか否か未定義。
同名の Store を重複登録可能にするか、名前でユニーク制約を付けるかはスキーマ設計の判断。
→ **スコープ上のリクエスト（`id text PK` のみ）ではユニーク制約なし。ただし DB 設計者が確認のこと。**

### 3-3. `storeResponseSchema` の配置
Recipe では `createRecipeSchema` / `updateRecipeSchema` のみが `api-contract` に定義され、
レスポンス用スキーマ（`RecipeDto` 型）は `application` 層に置かれている。
Store の `storeResponseSchema` を `api-contract` に置く場合、DTO 型との二重管理リスクがある。
→ **設計者が `api-contract` での定義範囲（リクエスト only か レスポンスも含むか）を判断のこと。**

### 3-4. マイグレーション生成コマンドの実行タイミング
`pnpm --filter @cookpit/web db:generate` は `apps/web` パッケージに紐づいているが、
スキーマファイルは `packages/infrastructure/src/db/schema.ts` に存在する。
drizzle.config.ts の設定を確認し、正しい出力先（migrations フォルダ）を把握する必要がある。
→ **実装者が `apps/web/drizzle.config.ts`（または同等）を確認のこと。**

---

## 4. 影響範囲（層・パッケージ・ファイル）

### 4-1. 変更ファイル（既存ファイルへの追記）

| ファイル | 変更内容 |
|---|---|
| `packages/domain/src/shared/store.repository.ts` | `save(store: Store): Promise<void>` を追加 |
| `packages/infrastructure/src/db/schema.ts` | `stores` テーブル定義を追記 |
| `packages/infrastructure/src/index.ts` | `DrizzleStoreRepository` のエクスポートを追加 |
| `packages/application/src/index.ts` | `store` モジュールのエクスポートを追加 |
| `packages/api-contract/src/index.ts` | `store.schema.ts` のエクスポートを追加 |
| `apps/web/src/server/app.ts` | `storesRoute` のマウント、`StoreNotFoundError` のエラーハンドリング追加 |

### 4-2. 新規作成ファイル

| ファイル | 内容 |
|---|---|
| `packages/infrastructure/src/repositories/drizzle-store.repository.ts` | `DrizzleStoreRepository implements StoreRepository` |
| `packages/infrastructure/src/db/migrations/` 以下 | Drizzle 生成マイグレーションファイル |
| `packages/application/src/store/store.dto.ts` | `StoreDto`、`CreateStoreInputDto` |
| `packages/application/src/store/store.mapper.ts` | `toStoreDto(store: Store): StoreDto` |
| `packages/application/src/store/store-not-found.error.ts` | `StoreNotFoundError extends Error` |
| `packages/application/src/store/get-stores.use-case.ts` | `GetStoresUseCase` |
| `packages/application/src/store/create-store.use-case.ts` | `CreateStoreUseCase` |
| `packages/application/src/store/index.ts` | バレルエクスポート |
| `packages/api-contract/src/store.schema.ts` | `createStoreSchema`、`storeResponseSchema` |
| `apps/web/src/server/routes/stores.ts` | `storesRoute`（Hono） |

### 4-3. 依存関係の波及

```
apps/web/src/server/app.ts
  └─→ apps/web/src/server/routes/stores.ts
        ├─→ @cookpit/application (GetStoresUseCase, CreateStoreUseCase)
        ├─→ @cookpit/infrastructure (DrizzleStoreRepository)
        └─→ @cookpit/api-contract (createStoreSchema)

packages/application/src/store/*
  └─→ packages/domain/src/shared/store.ts
  └─→ packages/domain/src/shared/store.repository.ts

packages/infrastructure/src/repositories/drizzle-store.repository.ts
  ├─→ packages/domain/src/shared/store.ts
  ├─→ packages/domain/src/shared/store.repository.ts
  └─→ packages/infrastructure/src/db/schema.ts
```

### 4-4. Recipe 先例との構造的差分

| 観点 | Recipe | Store（今回） |
|---|---|---|
| エンティティの複雑さ | 複数の値オブジェクト（RecipeIngredient, CookingStep 等） | シンプル（id, name, createdAt のみ） |
| Repository メソッド数 | 4（findById, findAll, save, delete） | 3（findById, findAll, save）※ delete なし |
| UseCase 数 | 5（CRUD） | 2（GetAll, Create）※ スコープ限定 |
| Drizzle の ON CONFLICT | SET（update） | SET（update）と同じ方式か、name 変更不可なら不要かも |
| Mapper の複雑さ | ネスト構造（ingredients/steps）のマッピングが複雑 | フラット（id, name, createdAt → string 変換のみ） |
| DB カラム型 | jsonb（ingredients/steps） | text のみ（シンプル） |
| 既存インターフェースへの追加 | 不要 | `save()` の追加が必要（ドメイン層の変更あり） |

---

## 5. 試験観点

### 正常系

| # | ケース | 期待結果 |
|---|---|---|
| N-01 | `CreateStoreUseCase.execute({ name: "西友" })` | `StoreDto` が返り、`repository.save()` が1回呼ばれる |
| N-02 | `CreateStoreUseCase.execute()` で生成した ID で後から `GetStoresUseCase` で確認できる | 取得一覧に含まれる |
| N-03 | `GetStoresUseCase.execute()` — 0件 | 空配列を返す |
| N-04 | `GetStoresUseCase.execute()` — 複数件 | 全件を `StoreDto[]` で返す |
| N-05 | `StoreMapper.toStoreDto()` — 各フィールドが正しく変換される | `createdAt` が ISO 8601 文字列 |
| N-06 | `POST /api/stores` — 正常なリクエストボディ | 201 + `StoreDto` |
| N-07 | `GET /api/stores` — 正常 | 200 + `StoreDto[]` |

### 異常系

| # | ケース | 期待結果 |
|---|---|---|
| E-01 | `Store.create({ name: "" })` | `Error('Store name is required')` が throw される（既存の Domain バリデーション） |
| E-02 | `Store.create({ name: "  " })` — 空白のみ | 同上 |
| E-03 | `POST /api/stores` に `name` が空文字 | 400（Zod バリデーションエラー） |
| E-04 | `POST /api/stores` に `name` キーなし | 400 |
| E-05 | `DATABASE_URL` 未設定時の Repository 呼び出し | `getDb()` から Error が throw される（既存の挙動） |
| E-06 | `CreateStoreUseCase` でドメインバリデーション違反 → `save()` が呼ばれない | `saveCount === 0` |

### 境界条件

| # | ケース | 期待結果 |
|---|---|---|
| B-01 | `name` が1文字 | 正常に作成される |
| B-02 | `name` が非常に長い文字列 | DB カラム制約次第（`text` 型は PostgreSQL で上限なし） |
| B-03 | 同名 Store の重複登録 | ユニーク制約がなければ別 ID で2件作成される（→ 3-2 の確認事項） |

---

## 6. リスク

| リスク | 内容 | 対策 |
|---|---|---|
| R-1 | `store.repository.ts` に `save()` を追加した後、既存の他テスト・他実装が `StoreRepository` 型を使っていた場合に型エラーが発生する | Grep で参照箇所を確認済み（現状は `store.repository.ts` のみ定義、実装クラスなし） |
| R-2 | `app.ts` の `AppType` が `storesRoute` 追加で変わり、フロント側の型推論が壊れる可能性 | 現時点で Store の Hono RPC クライアントを使う画面はないため影響なし |
| R-3 | マイグレーション生成コマンド（`db:generate`）のパスが不明 | `apps/web` の `package.json` スクリプトと `drizzle.config` を実装時に確認 |
| R-4 | `storeResponseSchema`（api-contract）と `StoreDto`（application）の二重定義 | 設計フェーズで定義範囲を明確にし、どちらかに寄せる |

---

## 7. 未確定事項（実装着手前に設計者が決定すること）

1. `storeResponseSchema` を `api-contract` に置くか、`StoreDto` だけで対応するか。
2. Store の `name` にユニーク制約を付けるか否か（DB スキーマレベル）。
3. `DrizzleStoreRepository.save()` は `INSERT ... ON CONFLICT DO UPDATE` を使うか（Recipe と同方式）、または `INSERT` のみ（store は create のみ想定）か。
4. `GetStoreUseCase`（単件取得）を今回のスコープに含めるか否か（API は `/api/stores/:id` なしと明示されているが、UseCase・Error クラス自体の準備をするか）。
