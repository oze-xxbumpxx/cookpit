# 試験計画: store-master

- 作成日: 2026-06-28
- 対象ブランチ: `claude/backlog-tasks-28cpv8`
- 関連設計書: `docs/designs/store-master.md`
- 関連要件書: `docs/requirements/store-master.md`
- セキュリティレビュー: `docs/reviews/store-master.md`（指摘反映済み）
- 変更レベル: L3（Domain / Application / Infrastructure / API-Contract / Presentation 全層）

---

## 1. 概要・前提

### 1-1. テスト対象コンポーネント

| 層 | コンポーネント | ファイル |
|---|---|---|
| Domain | `StoreId`（値オブジェクト） | `packages/domain/src/shared/store.ts` |
| Domain | `Store`（エンティティ） | `packages/domain/src/shared/store.ts` |
| Domain | `StoreRepository`（インターフェース） | `packages/domain/src/shared/store.repository.ts` |
| Application | `CreateStoreUseCase` | `packages/application/src/store/create-store.use-case.ts` |
| Application | `GetStoresUseCase` | `packages/application/src/store/get-stores.use-case.ts` |
| Application | `StoreMapper`（`toStoreDto`） | `packages/application/src/store/store.mapper.ts` |
| Application | `StoreNotFoundError` | `packages/application/src/store/store-not-found.error.ts` |
| API Contract | `createStoreSchema` / `storeResponseSchema` | `packages/api-contract/src/store.schema.ts` |
| Infrastructure | `DrizzleStoreRepository` | `packages/infrastructure/src/repositories/drizzle-store.repository.ts` |
| Presentation | `storesRoute`（`GET /api/stores`, `POST /api/stores`） | `apps/web/src/server/routes/stores.ts` |
| Presentation | `app.ts`（`onError` ハンドリング） | `apps/web/src/server/app.ts` |

### 1-2. 実装済みテストの現状

| テストファイル | 対象 | 件数 | ステータス |
|---|---|---|---|
| `packages/domain/src/shared/store.test.ts` | `StoreId` / `Store` | 8件 | 実装済み・通過 |
| `packages/application/src/store/store-use-cases.test.ts` | `CreateStoreUseCase` / `GetStoresUseCase` | 5件 | 実装済み・通過 |
| `packages/application/src/store/store.mapper.test.ts` | `toStoreDto` | 4件 | 実装済み・通過 |

Infrastructure / Presentation 層のテストは未実装（テスト基盤が今後整備予定）。

### 1-3. スコープ外

- `GET /api/stores/:id`（単件取得）— 設計書 D-5 によりスコープ外
- update / delete UseCase — スコープ外
- `StoreNotFoundError` を throw する UseCase のテスト — 現時点で該当 UseCase なし
- 冪等性テスト — 設計書 §19-4 により設計対象外（`POST /api/stores` は意図的に冪等でない）
- 画面（一覧・作成 UI）— スコープ外

---

## 2. 公開 API 網羅チェック

実装コードを走査して列挙した全 public API と試験計画の対応。

### 2-1. `StoreId`

| メソッド/プロパティ | 試験計画内の観点 |
|---|---|
| `static generate(): StoreId` | D-U-01, D-U-02 |
| `static fromString(value: string): StoreId` | D-U-03 |
| `equals(other: StoreId): boolean` | D-U-04, D-U-05 |
| `get value(): string` | D-U-03（副次確認） |

### 2-2. `Store`

| メソッド/プロパティ | 試験計画内の観点 |
|---|---|
| `static create(input: StoreCreateInput): Store` | D-U-06〜D-U-11 |
| `static reconstruct(props: StoreProps): Store` | D-U-12〜D-U-14 |
| `get id(): StoreId` | D-U-06（副次確認） |
| `get name(): string` | D-U-06（副次確認） |
| `get createdAt(): Date` | D-U-15（防御的コピー） |

### 2-3. `toStoreDto`（StoreMapper）

| 関数 | 試験計画内の観点 |
|---|---|
| `toStoreDto(store: Store): StoreDto` | A-U-01〜A-U-04 |

### 2-4. `CreateStoreUseCase`

| メソッド | 試験計画内の観点 |
|---|---|
| `constructor(storeRepository: StoreRepository)` | —（コンストラクタ、DI の確認は各テストで担保） |
| `execute(input: CreateStoreInputDto): Promise<StoreDto>` | A-U-05〜A-U-09 |

### 2-5. `GetStoresUseCase`

| メソッド | 試験計画内の観点 |
|---|---|
| `constructor(storeRepository: StoreRepository)` | — |
| `execute(): Promise<StoreDto[]>` | A-U-10〜A-U-12 |

### 2-6. `StoreNotFoundError`

| コンポーネント | 試験計画内の観点 |
|---|---|
| `constructor(storeId: string)` | A-U-13 |
| `name` プロパティ（`'StoreNotFoundError'`） | A-U-13 |
| `message` プロパティ | A-U-13 |

### 2-7. `createStoreSchema` / `storeResponseSchema`

| スキーマ/型 | 試験計画内の観点 |
|---|---|
| `createStoreSchema.parse()` | Z-01〜Z-05 |
| `storeResponseSchema.parse()` | R-01〜R-03 |
| `CreateStoreBody` 型 | Z-01（型チェック） |
| `StoreResponse` 型 | R-01（型整合） |

### 2-8. `DrizzleStoreRepository`

| メソッド | 試験計画内の観点 |
|---|---|
| `constructor(db: DrizzleClient)` | — |
| `findById(id: StoreId): Promise<Store | null>` | I-01〜I-03 |
| `findAll(): Promise<Store[]>` | I-04〜I-06 |
| `save(store: Store): Promise<void>` | I-07〜I-10 |
| `private toEntity(row: StoreRow): Store` | I-01, I-04（間接確認） |
| `private toRow(store: Store): NewStoreRow` | I-07（間接確認） |

### 2-9. `storesRoute`（Hono ルート）

| エンドポイント | 試験計画内の観点 |
|---|---|
| `GET /api/stores` | P-01〜P-03 |
| `POST /api/stores` | P-04〜P-09 |
| `onError`（`StoreNotFoundError`） | P-10 |
| `onError`（未知のエラー） | P-11 |

---

## 3. Domain 層ユニットテスト

テストランナー: Vitest（co-located: `packages/domain/src/shared/store.test.ts`）

### 3-1. `StoreId`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-01 | — | `StoreId.generate()` を呼ぶ | UUID 形式（`/^[0-9a-f-]{36}$/`）の文字列を値として持つ `StoreId` が返る | 実装済み（S1） |
| D-U-02 | — | `StoreId.generate()` を2回呼ぶ | 2つの `StoreId` の `equals()` が `false` を返す（毎回異なる UUID） | 実装済み（S-GAP-1） |
| D-U-03 | — | `StoreId.fromString('store-1')` を呼ぶ | `id.value === 'store-1'` かつ `id.equals(StoreId.fromString('store-1')) === true` | 実装済み（S2） |
| D-U-04 | 同じ文字列から生成した2つの `StoreId` | `a.equals(b)` | `true` を返す | 実装済み（S2 内） |
| D-U-05 | 異なる文字列から生成した2つの `StoreId` | `a.equals(b)` | `false` を返す | 実装済み（S-GAP-2） |

#### 境界値

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-BV-01 | — | `StoreId.fromString('')` | 空文字の `value` を持つ `StoreId` が生成される（ドメイン層は空文字チェックなし） | 未実装 |

### 3-2. `Store.create()`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-06 | — | `Store.create({ name: 'テスト店' })` | `store.name === 'テスト店'`、`store.id.value` が UUID 形式、`store.createdAt` が `Date` インスタンス | 実装済み（S3） |
| D-U-07 | — | `Store.create({ name: '店' })` を実行し `store.createdAt` を確認 | `createdAt` が呼び出し前後の現在時刻の範囲内 | 実装済み（S-GAP-3） |
| D-U-08 | `Store.create()` を2回呼ぶ | 各 `store.id.value` を比較 | 異なる UUID が採番される（毎回新しい ID） | 未実装 |

#### 異常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-09 | — | `Store.create({ name: '' })` | `Error('Store name is required')` が throw される | 実装済み（S4 内） |
| D-U-10 | — | `Store.create({ name: '  ' })` | `Error('Store name is required')` が throw される（空白のみ） | 実装済み（S4） |
| D-U-11 | — | `Store.create({ name: '\t\n' })` | `Error('Store name is required')` が throw される（タブ・改行のみ） | 未実装 |

#### 境界値

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-BV-02 | — | `Store.create({ name: 'a' })` | 正常に `Store` が生成される（1文字は有効） | 未実装 |
| D-U-BV-03 | — | `Store.create({ name: 'a'.repeat(255) })` | 正常に `Store` が生成される（Domain 層は長さ制限なし） | 未実装 |

### 3-3. `Store.reconstruct()`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-12 | — | `Store.reconstruct({ id: StoreId.fromString('store-1'), name: '復元店', createdAt })` | `store.id.value === 'store-1'`、`store.name === '復元店'`、`store.createdAt.toISOString() === createdAt.toISOString()` | 実装済み（S5） |
| D-U-13 | 任意の props | `Store.reconstruct(props)` で生成した store に対し、`store.id`・`store.name`・`store.createdAt` を参照 | 各 getter が props の値を返す（ドメインバリデーションを通さない） | 実装済み（S5） |

### 3-4. 防御性（不変条件・副作用）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| D-U-14 | `createdAt = new Date('2026-01-01T00:00:00.000Z')` で `Store.reconstruct()` を実行 | `reconstruct()` に渡した `createdAt` を後から変更（`setFullYear(2099)`）する | `store.createdAt.getFullYear()` が依然 `2026` であること（外部 Date の変更が内部状態に影響しない） | 実装済み（S-GAP-4） |
| D-U-15 | `Store.create()` または `reconstruct()` で生成した store | `const d1 = store.createdAt; const d2 = store.createdAt; d1.setFullYear(2099)` | `d2.getFullYear()` が元の年のまま（getter が毎回防御的コピーを返す） | 未実装 |

---

## 4. Application 層ユニットテスト

テストランナー: Vitest（co-located: `packages/application/src/store/`）

全テストは `InMemoryStoreRepository`（`StoreRepository` のインメモリ実装）を使用し、外部 I/O を持たない。

### 4-1. `toStoreDto`（StoreMapper）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-01 | `StoreId.fromString('store-1')`, `name: '西友'`, `createdAt: new Date('2026-01-01T00:00:00.000Z')` で `Store.reconstruct()` | `toStoreDto(store)` | `dto.id === 'store-1'`、`dto.name === '西友'`、`dto.createdAt === '2026-01-01T00:00:00.000Z'`（全フィールド） | 実装済み（N-05） |
| A-U-02 | 任意の Store | `toStoreDto(store)` | `dto.createdAt` が `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` にマッチ（ISO 8601 / UTC / `Z` サフィックス） | 実装済み |
| A-U-03 | `StoreId.fromString('abc-123')` の Store | `toStoreDto(store)` | `dto.id === 'abc-123'`（`store.id.value` の素通し） | 実装済み |
| A-U-04 | `name: 'マルエツ'` の Store | `toStoreDto(store)` | `dto.name === 'マルエツ'`（`store.name` の素通し） | 実装済み |

### 4-2. `CreateStoreUseCase.execute()`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-05 | `InMemoryStoreRepository`（空）、`CreateStoreUseCase(repository)` | `execute({ name: '西友' })` | `dto.name === '西友'`、`dto.id` が空でない文字列、`dto.createdAt` が ISO 8601 形式、`repository.saveCount === 1`、`repository.size === 1` | 実装済み（N-01） |
| A-U-06 | 同上 | 戻り値 `dto.id` と `repository` に保存された store の `id.value` を比較 | 一致する（DTO と保存された Entity の ID が同一） | 未実装 |

#### 異常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-07 | `InMemoryStoreRepository`（空）、`CreateStoreUseCase(repository)` | `execute({ name: '' })` | `Error('Store name is required')` が throw され、`repository.saveCount === 0`、`repository.size === 0`（保存されない） | 実装済み（E-01） |
| A-U-08 | 同上 | `execute({ name: '  ' })` | `Error('Store name is required')` が throw され、`saveCount === 0`（空白のみも拒否） | 実装済み（E-02） |

#### 境界値

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-BV-01 | `InMemoryStoreRepository`（空） | `execute({ name: 'a' })` | 正常に `StoreDto` が返る（1文字は有効） | 未実装 |
| A-U-BV-02 | 同上 | `execute({ name: 'a'.repeat(255) })` | 正常に `StoreDto` が返る（Domain 層は長さ制限なし） | 未実装 |

### 4-3. `CreateStoreUseCase` + `GetStoresUseCase` 連携（N-02）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-09 | `InMemoryStoreRepository`（空）、各 UseCase 共有 | `CreateStoreUseCase.execute({ name: 'マルエツ' })` → `GetStoresUseCase.execute()` | `dtos.length === 1`、`dtos[0].id === created.id`、`dtos[0].name === 'マルエツ'` | 実装済み（N-02） |

### 4-4. `GetStoresUseCase.execute()`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-10 | `InMemoryStoreRepository`（空） | `GetStoresUseCase(repository).execute()` | `[]`（空配列） | 実装済み（N-03） |
| A-U-11 | `InMemoryStoreRepository`（'イオン', 'ライフ' をシード済み） | `GetStoresUseCase(repository).execute()` | `dtos.length === 2`、名前のリストが `['イオン', 'ライフ']`（全件） | 実装済み（N-04） |
| A-U-12 | `InMemoryStoreRepository`（`id: 'id-1'`, `name: '西友'`, `createdAt: '2026-01-01T00:00:00.000Z'` をシード済み） | `execute()` | `dtos[0].id === 'id-1'`、`dtos[0].name === '西友'`、`dtos[0].createdAt === '2026-01-01T00:00:00.000Z'` | 実装済み |

### 4-5. `StoreNotFoundError`

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| A-U-13 | — | `new StoreNotFoundError('store-uuid-123')` | `error.message === 'Store not found: store-uuid-123'`、`error.name === 'StoreNotFoundError'`、`error instanceof Error === true` | 未実装 |

---

## 5. API Contract 層テスト（契約テスト）

テストランナー: Vitest。`packages/api-contract/` に co-located で新規作成が望ましい。

### 5-1. `createStoreSchema` の Zod バリデーション

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| Z-01 | — | `createStoreSchema.parse({ name: '西友' })` | 成功し `{ name: '西友' }` が返る（`CreateStoreBody` 型） | 未実装 |
| Z-02 | — | `createStoreSchema.parse({ name: '' })` | `ZodError` が throw される（`refine` 失敗、`message: 'required'`） | 未実装 |
| Z-03 | — | `createStoreSchema.parse({ name: '  ' })` | `ZodError` が throw される（trim 後が空文字） | 未実装 |
| Z-04 | — | `createStoreSchema.parse({})` | `ZodError` が throw される（`name` フィールド欠損） | 未実装 |
| Z-05 | — | `createStoreSchema.parse({ name: 'a' })` | 成功（1文字は有効） | 未実装 |
| Z-06 | — | `createStoreSchema.parse({ name: 'a'.repeat(255) })` | 成功（255文字は上限） | 未実装 |
| Z-07 | — | `createStoreSchema.parse({ name: 'a'.repeat(256) })` | `ZodError` が throw される（`.max(255)` 違反） | 未実装 |
| Z-08 | — | `createStoreSchema.parse({ name: null })` | `ZodError` が throw される（`string` ではない） | 未実装 |

**備考**: 実装済みの `createStoreSchema` は `.max(255)` を含む（セキュリティレビュー指摘 Should-1 への対応実装済み）。Z-06・Z-07 はその制約の確認テスト。

### 5-2. `storeResponseSchema` の型往復テスト（D-2 確認）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| R-01 | `StoreDto` 型の値 `{ id: 'x', name: 'y', createdAt: '2026-01-01T00:00:00.000Z' }` | `storeResponseSchema.parse(dto)` | 成功する（`StoreResponse` と `StoreDto` の構造が一致） | 未実装 |
| R-02 | `toStoreDto()` が返す `StoreDto` | `storeResponseSchema.parse(storeDto)` | 成功する（Mapper 出力が契約スキーマを満たす） | 未実装 |
| R-03 | `createdAt` フィールドが `toISOString()` 形式 | `storeResponseSchema.parse({ id: 'x', name: 'y', createdAt: new Date().toISOString() })` | 成功する（`z.string()` が ISO 8601 文字列を受け入れる） | 未実装 |
| R-04 | `createdAt` フィールドが `Date` 型 | `storeResponseSchema.parse({ id: 'x', name: 'y', createdAt: new Date() })` | `ZodError` が throw される（`z.string()` が `Date` オブジェクトを拒否） | 未実装 |

**備考**: R-01 は TypeScript の型チェック（`pnpm type-check`）でも確認できるが、ランタイム検証として実施することが望ましい。

### 5-3. 後方互換確認テスト

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| BC-01 | `@cookpit/api-contract` から `store.schema.ts` を追記した後 | `createRecipeSchema` / `updateRecipeSchema` に既存の正常系入力を渡す | 既存の Recipe 契約テストが引き続き通過する | 未実装（回帰確認） |
| BC-02 | `packages/api-contract/src/index.ts` 追記後 | `@cookpit/api-contract` から `CreateRecipeBody` / `UpdateRecipeBody` を `import` | 型として参照できる（既存エクスポートが消えていない） | `pnpm type-check` で確認済み |

---

## 6. Infrastructure 層結合テスト

**注意**: Infrastructure 層のテスト基盤は今後整備予定。現時点では全ケース未実装。実際の PostgreSQL（または Neon テスト環境）を使用する。

### 6-1. `DrizzleStoreRepository.findById()`

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| I-01 | `stores` テーブルに `{ id: 'x', name: '西友', created_at: ... }` を INSERT 済み | `findById(StoreId.fromString('x'))` | `Store` インスタンスが返り、`store.id.value === 'x'`、`store.name === '西友'` | 未実装 |
| I-02 | `stores` テーブルが空 | `findById(StoreId.fromString('nonexistent'))` | `null` が返る | 未実装 |
| I-03 | 別の ID のレコードが存在する | `findById(StoreId.fromString('not-match'))` | `null` が返る（存在しない ID に対して null） | 未実装 |

### 6-2. `DrizzleStoreRepository.findAll()`

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| I-04 | `stores` テーブルが空 | `findAll()` | `[]`（空配列） | 未実装 |
| I-05 | `stores` テーブルに3件 INSERT（`created_at` が異なる） | `findAll()` | 3件の `Store[]` が返り、`created_at ASC` 順に並ぶ | 未実装 |
| I-06 | 1件 INSERT | `findAll()` | 1件の `Store[]`、各フィールドが DB の値と一致 | 未実装 |

### 6-3. `DrizzleStoreRepository.save()`（新規作成）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| I-07 | `stores` テーブルが空 | `save(store)` → `findById(store.id)` | `findById` で同一の `Store` が取得できる（`name` が一致） | 未実装 |
| I-08 | `stores` テーブルが空 | `save(store)` | `stores` テーブルに1件 INSERT される | 未実装 |

### 6-4. `DrizzleStoreRepository.save()`（upsert / 冪等性）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| I-09 | `{ id: 'x', name: '西友' }` を `save()` 済み | `store.name` を '西友（改）' に変えた Store で同一 ID を `save()` | `findById('x')` で `name === '西友（改）'`（ON CONFLICT UPDATE が機能する） | 未実装 |
| I-10 | `{ id: 'x', name: '西友', created_at: T1 }` を `save()` 済み | 同一 ID の Store を再 `save()` | `findById('x').createdAt` が `T1` のまま（`created_at` は UPDATE 対象外） | 未実装 |

### 6-5. DB スキーマ確認

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| I-11 | マイグレーション適用済み DB | `INSERT INTO stores (id, name) VALUES ('x', '')` | 成功する（`name` の空文字は DB レベルでは制約なし。アプリ層で防御） | 未実装（手動確認） |
| I-12 | 同上 | `INSERT INTO stores (id, name) VALUES (NULL, '西友')` | `NOT NULL` 制約違反でエラー | 未実装（手動確認） |
| I-13 | 同上 | 同一 `id` で2回 INSERT（ON CONFLICT なし） | `PRIMARY KEY` 制約違反でエラー | 未実装（手動確認） |

---

## 7. Presentation 層テスト（API 統合テスト）

**注意**: Presentation 層のテスト基盤は今後整備予定。現時点では全ケース未実装。Hono の `app.request()` を使ったインプロセス HTTP テスト、または実際の HTTP クライアントを想定する。

### 7-1. `GET /api/stores`

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| P-01 | DB が空（または `GetStoresUseCase` をモック：`[]` を返す） | `GET /api/stores` | HTTP 200、レスポンスボディ `[]` | 未実装 |
| P-02 | 2件の Store が存在（またはモック） | `GET /api/stores` | HTTP 200、`StoreDto[]` が返る、各フィールドが `{ id, name, createdAt }` の構造 | 未実装 |
| P-03 | 任意の DB 状態 | `GET /api/stores` | `Content-Type: application/json` | 未実装 |

### 7-2. `POST /api/stores`

#### 正常系

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| P-04 | DB が空（または `CreateStoreUseCase` をモック） | `POST /api/stores` body: `{ "name": "西友" }` | HTTP 201、レスポンスボディが `{ id, name: "西友", createdAt }` の構造 | 未実装 |
| P-05 | 同上 | `POST /api/stores` body: `{ "name": "a" }` | HTTP 201（1文字の name も有効） | 未実装 |
| P-06 | 同上 | `POST /api/stores` body: `{ "name": "a".repeat(255) }` | HTTP 201（255文字は上限内） | 未実装 |

#### 異常系（Zod バリデーション）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| P-07 | — | `POST /api/stores` body: `{ "name": "" }` | HTTP 400、`{ "success": false, "error": { "issues": [...] } }` 形式 | 未実装 |
| P-08 | — | `POST /api/stores` body: `{ "name": "  " }` | HTTP 400（空白のみ） | 未実装 |
| P-09 | — | `POST /api/stores` body: `{}` | HTTP 400（`name` キーなし） | 未実装 |
| P-09b | — | `POST /api/stores` body: `{ "name": "a".repeat(256) }` | HTTP 400（255文字超、`.max(255)` 違反） | 未実装 |

### 7-3. エラーハンドリング（`app.ts` `onError`）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| P-10 | `StoreNotFoundError` が throw されるようにモック設定 | 任意のリクエスト | HTTP 404、`{ "error": "Store not found: <id>" }` | 未実装 |
| P-11 | 未知の `Error` が throw されるようにモック設定 | 任意のリクエスト | HTTP 500、`{ "error": "Internal Server Error" }`（内部情報は含まれない） | 未実装 |

### 7-4. 後方互換（回帰）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| P-REG-01 | `storesRoute` マウント後 | `GET /api/health` | 既存のレスポンスが変わらない | `pnpm test` で確認 |
| P-REG-02 | 同上 | `GET /api/recipes` | 既存の Recipe ルートのレスポンスが変わらない | `pnpm test` で確認 |
| P-REG-03 | 同上 | `POST /api/recipes` に無効なボディ | `RecipeNotFoundError` 分岐が壊れていない（404 が返る） | 未実装 |

---

## 8. セキュリティ観点テスト

レビュー記録（`docs/reviews/store-master.md`）の指摘事項を観点として反映。

### 8-1. [Should-1] `name` の最大長制約（`.max(255)`）確認

実装済みの `createStoreSchema` では `nonBlankString` に `.max(255)` が追加されている。上記 Z-06・Z-07・P-06・P-09b で確認する。

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| SEC-01 | — | `createStoreSchema.parse({ name: 'a'.repeat(255) })` | 成功（255文字は有効） | 未実装（Z-06 と同一） |
| SEC-02 | — | `createStoreSchema.parse({ name: 'a'.repeat(256) })` | `ZodError`（`.max(255)` 違反） | 未実装（Z-07 と同一） |
| SEC-03 | — | `POST /api/stores` body: `{ "name": "a".repeat(256) }` | HTTP 400（API レベルで 256文字を拒否） | 未実装（P-09b と同一） |

### 8-2. [Should-3] エラーレスポンスへの内部情報漏洩なし

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| SEC-04 | DB 接続エラーをモックで発生させる | `GET /api/stores` | HTTP 500、レスポンスボディが `{ "error": "Internal Server Error" }` のみ（DB 接続文字列・スタックトレース等が含まれない） | 未実装 |

### 8-3. SQL インジェクション（確認済み・設計上問題なし）

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| SEC-05 | — | `POST /api/stores` body: `{ "name": "'; DROP TABLE stores; --" }` | HTTP 201、DB に文字列として正常保存される（Drizzle ORM のパラメータバインディングによりインジェクション不成立） | 未実装（Infrastructure 結合テスト） |

---

## 9. データ整合性テスト

| # | 前提 | 操作 | 期待結果 | 実装状況 |
|---|---|---|---|---|
| DI-01 | `CreateStoreUseCase` で生成した `StoreDto` | `StoreDto.id` と実際に DB に INSERT された `id` を比較 | 一致する（UseCase → Mapper → DB のデータが正確に通過する） | 未実装 |
| DI-02 | `DrizzleStoreRepository.save(store)` 実行後 | `findById(store.id)` で取得した Store の `name` と `store.name` を比較 | 一致する | 未実装（I-07 と同一） |
| DI-03 | `toStoreDto(store)` の `createdAt` と `storeResponseSchema.parse(dto)` の結果 | `storeResponseSchema.parse(dto).createdAt` | `dto.createdAt` と同一文字列（変換なし）、かつ `z.string()` の parse が成功する | 未実装（R-02 と同一） |

---

## 10. 回帰試験範囲

Store マスタ実装による影響範囲の回帰確認。

| # | 対象 | 確認方法 | 実装状況 |
|---|---|---|---|
| REG-01 | Domain 層の全既存テスト（Recipe・共通） | `pnpm test` を実行し 0 failures | 確認済み（129 tests pass） |
| REG-02 | Application 層の全既存テスト（Recipe 関連） | `pnpm test` を実行し 0 failures | 確認済み（44 tests pass） |
| REG-03 | `packages/api-contract/src/index.ts` の既存エクスポート | `import { createRecipeSchema, updateRecipeSchema } from '@cookpit/api-contract'` が通る | `pnpm type-check` で確認済み |
| REG-04 | `packages/application/src/index.ts` の既存エクスポート | Recipe 関連クラスの import が通る | `pnpm type-check` で確認済み |
| REG-05 | `packages/infrastructure/src/index.ts` の既存エクスポート | `DrizzleRecipeRepository` の import が通る | `pnpm type-check` で確認済み |
| REG-06 | `app.ts` `AppType` の型安全性 | `storesRoute` 追加後も既存の Hono RPC クライアント型（`client.recipes.*`）が有効 | `pnpm type-check` で確認済み |
| REG-07 | `StoreRepository` インターフェースへの `save()` 追加後 | 既存の型参照箇所でコンパイルエラーが起きない | `pnpm type-check` で確認済み |

---

## 11. 試験データ

### 11-1. 標準テストデータ

| 用途 | `id` | `name` | `createdAt` |
|---|---|---|---|
| 基本ケース | `'store-1'` | `'西友'` | `new Date('2026-01-01T00:00:00.000Z')` |
| 複数件（1件目） | `'id-1'` | `'イオン'` | `new Date('2026-01-01T00:00:00.000Z')` |
| 複数件（2件目） | `'id-2'` | `'ライフ'` | `new Date('2026-01-02T00:00:00.000Z')` |
| 異なる ID 確認 | `'abc-123'` | `'テスト店舗'` | `new Date('2026-06-01T00:00:00.000Z')` |

### 11-2. 境界値テストデータ

| 用途 | `name` の値 |
|---|---|
| 最短（1文字） | `'a'` |
| 最長（255文字） | `'a'.repeat(255)` |
| 超過（256文字） | `'a'.repeat(256)` |
| 空文字 | `''` |
| 空白のみ | `'  '`（スペース2文字） |
| タブ・改行のみ | `'\t\n'` |
| SQL インジェクション試行 | `"'; DROP TABLE stores; --"` |

### 11-3. `InMemoryStoreRepository` の活用

Application 層テストでは `InMemoryStoreRepository`（`store-use-cases.test.ts` で定義済み）を使用する。各テストの `beforeEach` でリセットし、テスト間の副作用を排除する。

---

## 12. 完了条件

### 12-1. 必須（リリースブロッカー）

- [ ] `pnpm test` が 0 failures（既存 129 + application 45 = 174 tests 以上がすべて pass）
- [ ] `pnpm type-check` がエラーなし
- [ ] `pnpm lint` がエラーなし（既存 warning 2件は除く）
- [ ] Application 層の実装済みテスト（N-01〜N-04、E-01・E-02、N-02 ラウンドトリップ、mapper 4件）がすべて通過
- [ ] 設計書の確定判断 D-1〜D-6 が実装に反映されていること（品質レビュー確認済み）

### 12-2. 推奨（Should）

- [ ] `StoreNotFoundError` の構造テスト（A-U-13）を実装
- [ ] `createStoreSchema` の Zod バリデーションテスト（Z-01〜Z-08）を実装
- [ ] `storeResponseSchema` の型往復テスト（R-01〜R-04）を実装
- [ ] Domain 層の防御的コピー確認テスト（D-U-15）を実装
- [ ] `CreateStoreUseCase` の境界値テスト（A-U-BV-01・A-U-BV-02）を実装

### 12-3. 将来フェーズ（テスト基盤整備後）

- [ ] Infrastructure 結合テスト（I-01〜I-13）の実装
- [ ] Presentation 統合テスト（P-01〜P-11）の実装
- [ ] セキュリティ観点テスト（SEC-04・SEC-05）の実装

---

## 13. 実装済み vs 未実装のサマリ

| 層 | 観点 ID | 件数 | 実装状況 |
|---|---|---|---|
| Domain | D-U-01〜D-U-05 | 5件 | 実装済み |
| Domain | D-U-06〜D-U-08 | 3件 | 一部実装済み（D-U-08 未実装） |
| Domain | D-U-09〜D-U-11 | 3件 | 一部実装済み（D-U-11 未実装） |
| Domain | D-U-12〜D-U-14 | 3件 | 実装済み |
| Domain（防御性） | D-U-15, D-U-BV-01〜D-U-BV-03 | 4件 | 未実装 |
| Application（Mapper） | A-U-01〜A-U-04 | 4件 | 実装済み |
| Application（UseCase） | A-U-05〜A-U-12 | 8件 | 実装済み |
| Application（StoreNotFoundError） | A-U-13 | 1件 | 未実装 |
| Application（境界値） | A-U-BV-01・A-U-BV-02 | 2件 | 未実装 |
| API Contract | Z-01〜Z-08, R-01〜R-04, BC-01〜BC-02 | 14件 | 未実装 |
| Infrastructure | I-01〜I-13 | 13件 | 未実装（基盤整備待ち） |
| Presentation | P-01〜P-11, P-REG-01〜P-REG-03 | 14件 | 未実装（基盤整備待ち） |
| セキュリティ | SEC-01〜SEC-05 | 5件（上記と重複含む） | 未実装 |
| 回帰 | REG-01〜REG-07 | 7件 | type-check / test で確認済み |
