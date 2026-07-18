# 実装計画: product-master

- 前提となる設計書: `docs/designs/product-master.md` / `docs/designs/product-master.contract.md`
- 要件定義: `docs/requirements/product-master.md`
- レベル: L3
- 作成日: 2026-06-26

---

## 0. 着手前ユーザー確認ブロッカー

以下の項目は **DB スキーマ確定に直結する**ため、実装着手前にユーザー承認が必要。
設計書の推奨案をデフォルトとして記載するが、確定待ち扱いとする。

| 優先度 | ID     | 未決事項                            | 設計推奨案                                                   | 確定が必要な理由                                                                             |
| ------ | ------ | ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 高     | **U1** | unitPrice の丸め桁数・丸め方式      | 小数点以下1桁 + `Math.round` + `numeric(10, 1)` カラム       | DB スキーマ `price_records.priceAmount` / `unitPriceAmount` のカラム型に直結。後から変更困難 |
| 高     | **U7** | price_records テーブル設計          | 独立テーブル（案B）。Repository が JOIN 復元                 | スキーマ設計の根幹。jsonb への切り替えはマイグレーションコストが高い                         |
| 中     | **U3** | DeleteProductUseCase の存在チェック | `ProductNotFoundError` を throw（冪等成功ではなく NotFound） | API 契約・UX に影響                                                                          |
| 中     | **U5** | 価格記録の重複可否                  | 重複許可（最新 = 最大 `observedAt`）。UUID PK                | PK 設計・DB 制約に影響                                                                       |
| 中     | **C1** | RecordPrice 成功ステータス          | 200 空ボディ                                                 | Hono ルート実装に影響                                                                        |
| 中     | **C2** | cheapest-store の null 表現         | `{ "data": null }` / 非null も `{ "data": {...} }` で統一    | フロントの型安全な取り回しに影響                                                             |

本計画は上記すべての**設計推奨案が承認された前提**で記述する。
承認前に変更が生じた場合、影響を受けるステップは再確認すること。

---

## 1. スコープ外の明示

以下は本計画に含まない。

- Recipe 集約・`packages/domain/src/recipe/` への変更（`recipe-ingredient.ts` の `interface ProductId` も削除しない）
- 認証（ADR-003 準拠、MVP1 は認証なし）
- MealPlan / ShoppingList / Pantry の実装
- Application / Infrastructure 層の自動テスト整備（後続フェーズ）
- `ValidationError` クラス導入（ビジネスルール違反の 400 マッピング）—— Sprint 2 スコープ外

---

## 2. 実装順序の方針

Clean Architecture の依存方向に従い、依存される側から実装する。

```
Phase 1: Domain
  └─ packages/domain/src/shared/ (money.ts, store.ts)
  └─ packages/domain/src/product/ (product-id.ts, price-record-id.ts, product.ts, unit-price-calculator.ts, product.repository.ts, store.repository.ts)
  └─ co-located テスト (*.test.ts)

Phase 2: Infrastructure
  └─ packages/infrastructure/src/db/schema.ts  ← stores/products/price_records 追記
  └─ packages/infrastructure/src/repositories/drizzle-product.repository.ts (新規)
  └─ packages/infrastructure/src/repositories/drizzle-store.repository.ts (新規)
  └─ packages/infrastructure/src/index.ts  ← re-export 追記
  └─ マイグレーション生成 + Store シード

Phase 3: Application
  └─ packages/application/src/product/ (dto, mapper, errors, 8 UseCases, index.ts)
  └─ packages/application/src/index.ts  ← 追記

Phase 4: Presentation
  └─ packages/api-contract/src/ (product.schema.ts, store.schema.ts, index.ts 追記)
  └─ apps/web/src/server/routes/ (products.ts, stores.ts 新規)
  └─ apps/web/src/server/app.ts  ← route 登録 + onError 拡張
  └─ shadcn/ui chart (Recharts) 導入
  └─ apps/web/src/app/products/ (4画面 + コンポーネント)
```

---

## 3. 依存関係グラフ

```
[Phase 1: Domain]
  S1-1 money.ts
  S1-2 store.ts / StoreId  ← S1-1 に依存（Store は Money を持たないが参照対称）
  S1-3 product-id.ts
  S1-4 price-record-id.ts
  S1-5 product.ts (Product + PriceRecord)  ← S1-1, S1-2, S1-3, S1-4 に依存
  S1-6 unit-price-calculator.ts  ← S1-1 に依存
  S1-7 product.repository.ts (interface)  ← S1-3, S1-5 に依存
  S1-8 store.repository.ts (interface)  ← S1-2 に依存
  S1-9 Domain テスト (*.test.ts)  ← S1-1 〜 S1-6 に依存

[Phase 2: Infrastructure]
  S2-1 schema.ts 追記  ← Phase 1 完了後
  S2-2 drizzle-product.repository.ts  ← S2-1, S1-7 に依存
  S2-3 drizzle-store.repository.ts  ← S2-1, S1-8 に依存
  S2-4 index.ts 追記  ← S2-2, S2-3 に依存
  S2-5 マイグレーション生成 + Store シード  ← S2-1 に依存

[Phase 3: Application]
  S3-1 product.dto.ts  ← Phase 1 完了後（Domain 型を import type）
  S3-2 product-not-found.error.ts  ← 独立
  S3-3 store-not-found.error.ts  ← 独立
  S3-4 product.mapper.ts  ← S3-1, Phase 1 に依存
  S3-5 8 UseCase ファイル  ← S3-1〜S3-4, S1-7, S1-8 に依存
  S3-6 index.ts + application/index.ts 追記  ← S3-5 に依存

[Phase 4: Presentation]
  S4-1 product.schema.ts + store.schema.ts  ← Phase 3 (dto) の型方針に依存
  S4-2 api-contract/index.ts 追記  ← S4-1 に依存
  S4-3 products.ts (Hono route)  ← S4-1, Phase 3 UseCase に依存
  S4-4 stores.ts (Hono route)  ← S4-1, Phase 3 UseCase に依存
  S4-5 app.ts 追記  ← S4-3, S4-4, Phase 3 errors に依存
  S4-6 shadcn/ui chart (Recharts) 導入  ← S4-5 の前でも後でも可（画面実装の前に必要）
  S4-7 商品一覧画面  ← S4-5, Phase 3 に依存
  S4-8 商品作成画面  ← S4-5, Phase 3 に依存
  S4-9 商品詳細画面  ← S4-5, S4-6, Phase 3 に依存
  S4-10 商品編集画面  ← S4-5, Phase 3 に依存
```

---

## 4. Phase 1: Domain 層

### S1-1. `packages/domain/src/shared/money.ts` （新規）

**対象ファイル**: `packages/domain/src/shared/money.ts`

**実装内容**:

- `Money` 値オブジェクトクラス。`private constructor(amount: number, currency: string)`
- `static of(amount: number, currency: string): Money` — `amount < 0` のとき `Error('Money amount must be non-negative')` を throw
- `add(other: Money): Money` — 同一通貨チェック（異通貨で throw）、合算
- `multiply(factor: number): Money` — 係数倍した新 Money を返す
- `isLessThan(other: Money): boolean` — 金額比較
- `get amount(): number` / `get currency(): string` ゲッター
- テストファイル: `packages/domain/src/shared/money.test.ts`（co-located）
  - `Money.of` 非負チェック（0 は OK、負は throw）
  - `add` 正常・異通貨 throw
  - `multiply` 正常
  - `isLessThan` 正常

**依存**: なし（Domain 層完結）

**完了条件**:

- `pnpm --filter @cookpit/domain test` が green
- `pnpm --filter @cookpit/domain type-check` が通る

---

### S1-2. `packages/domain/src/shared/store.ts` （新規）

**対象ファイル**: `packages/domain/src/shared/store.ts`

**実装内容**:

- `StoreId` 値オブジェクト — `RecipeId` と同パターン（`randomUUID` 使用）
  - `static generate(): StoreId`
  - `static fromString(value: string): StoreId`
  - `equals(other: StoreId): boolean`
  - `get value(): string`
- `Store` Entity（読み取り専用。MVP1 は更新なし）
  - `private constructor(id: StoreId, name: string, createdAt: Date)`
  - `static reconstruct(props: { id: StoreId; name: string; createdAt: Date }): Store`
  - `static create(input: { name: string }): Store` — name 空白チェック
  - ゲッター: `id`, `name`, `createdAt`
- テストファイル: `packages/domain/src/shared/store.test.ts`（co-located）
  - `StoreId.generate()` が UUID 形式を返すこと
  - `StoreId.fromString()` の往復一致

**依存**: S1-1（なし。Store は Money を持たない）

**完了条件**:

- `pnpm --filter @cookpit/domain test` が green
- `pnpm --filter @cookpit/domain type-check` が通る

---

### S1-3. `packages/domain/src/product/product-id.ts` （新規）

**対象ファイル**: `packages/domain/src/product/product-id.ts`

**実装内容**:

- `ProductId` クラス — `RecipeId` と完全に同パターン（`randomUUID` 使用）
  - `static generate(): ProductId`
  - `static fromString(value: string): ProductId`
  - `equals(other: ProductId): boolean`
  - `get value(): string`
- `private constructor(private readonly productIdValue: string) {}`
- 注記: `packages/domain/src/recipe/recipe-ingredient.ts` 内のローカル `interface ProductId` は削除しない（Sprint 2 スコープ外）。正式 `ProductId` クラスは `{ readonly value: string }` を実装しており構造的に互換。
- テストファイル: `packages/domain/src/product/product-id.test.ts`（co-located）
  - `generate()` が UUID 形式を返すこと
  - `fromString()` の往復一致

**依存**: なし

**完了条件**: S1-1 と同様

---

### S1-4. `packages/domain/src/product/price-record-id.ts` （新規）

**対象ファイル**: `packages/domain/src/product/price-record-id.ts`

**実装内容**:

- `PriceRecordId` クラス — `ProductId` と同パターン
  - `static generate(): PriceRecordId`
  - `static fromString(value: string): PriceRecordId`
  - `equals(other: PriceRecordId): boolean`
  - `get value(): string`

**依存**: なし

**完了条件**: type-check 通過（個別テストは product.test.ts の PriceRecord テストでカバー）

---

### S1-5. `packages/domain/src/product/product.ts` （新規）

**対象ファイル**: `packages/domain/src/product/product.ts`

**実装内容**:

`ProductCategory` 型:

```
export type ProductCategory = '野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | 'その他';
```

`PriceRecord` 値オブジェクト（イミュータブル）:

- フィールド: `id: PriceRecordId`, `storeId: StoreId`, `price: Money`, `unitPrice: Money`, `packageSize: Quantity`, `observedAt: Date`
- `static create(props: {...}): PriceRecord` — バリデーションなし（UseCase 入口で保証済み）
- `static reconstruct(props: {...}): PriceRecord` — DB 復元用
- ゲッター全フィールド

`Product` 集約:

- `private constructor(...)` — 全フィールドを受け取る
- フィールド: `id: ProductId`, `name: string`, `aliases: string[]`, `category: ProductCategory`, `defaultUnit: Unit`, `priceHistory: PriceRecord[]`, `createdAt: Date`, `updatedAt: Date`
- `static create(input: CreateProductInput): Product`
  - `name.trim() === ''` → `throw new Error('Product name is required')`
  - `ProductId.generate()`、`now = new Date()`、空 `priceHistory`
- `static reconstruct(props: ProductProps): Product` — DB 復元
- `update(input: UpdateProductInput): void` — name バリデーション、`this.touch()`
- `recordPrice(record: PriceRecord): void` — `this.priceHistory` に push、`this.touch()`
- `latestPriceAt(storeId: StoreId): PriceRecord | null`
  - `priceHistory` から `storeId` で絞り込み → `observedAt` 降順ソート → 先頭要素
- `cheapestStoreAt(at: Date): StoreId | null`
  - 全 StoreId を収集 → 各 StoreId の `latestPriceAt()` を呼ぶ → `unitPrice.amount` で比較 → 最小の `storeId` を返す。記録なしは `null`
- `private touch(): void` — `this.updatedDate = new Date()`
- ゲッター全フィールド（`priceHistory` はスプレッドコピーで返す）

テストファイル: `packages/domain/src/product/product.test.ts`（co-located）

- `Product.create()`: name 空白エラー、正常作成
- `Product.recordPrice()`: 記録追加後 `priceHistory` に含まれること
- `Product.latestPriceAt()`: 単一レコード、複数レコード（最新が返る）、存在しない storeId → null
- `Product.cheapestStoreAt()`: 記録なし → null、単一店舗、複数店舗（最安が返る）
- `PriceRecord.create()`: 正常動作

**依存**: S1-1 (Money), S1-2 (StoreId), S1-3 (ProductId), S1-4 (PriceRecordId), `packages/domain/src/shared/quantity.ts`, `packages/domain/src/shared/unit.ts`

**完了条件**:

- `pnpm --filter @cookpit/domain test` が green（product.test.ts を含む）

---

### S1-6. `packages/domain/src/product/unit-price-calculator.ts` （新規）

**対象ファイル**: `packages/domain/src/product/unit-price-calculator.ts`

**実装内容**:

- ドメインサービスクラス `UnitPriceCalculator`（または名前付き export の純粋関数でも可）
- `static calculate(priceAmount: number, packageSize: Quantity): Money`

計算ロジック（設計書 §5 の通り）:

```
const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);

重量系: gramValue = unit === 'kg' ? value * 1000 : value
        unitPriceAmount = priceAmount / gramValue * 100
容量系: mlValue = unit === 'l' ? value * 1000 : value
        unitPriceAmount = priceAmount / mlValue * 100
個数系・調理単位: unitPriceAmount = priceAmount / value

丸め: Math.round(unitPriceAmount * 10) / 10  （U1 推奨案: 小数点以下1桁）
戻り値: Money.of(rounded, 'JPY')
```

テストファイル: `packages/domain/src/product/unit-price-calculator.test.ts`（co-located）

- 重量系 g: `137 / 300 * 100` → `45.7`
- 重量系 kg: `300 / 1 * 100 / 1000` = `300/1000*100 = 30` 相当（1kg袋300円）
- 容量系 ml: 正常
- 容量系 l: l→ml 変換後
- 個数系（`個`）: `priceAmount / value`
- 調理単位（`大さじ`）: `priceAmount / value`
- ゼロ除算確認（packageSizeValue > 0 は UseCase 入口で保証済み。本テストでは正数を前提）

**依存**: S1-1 (Money), `packages/domain/src/shared/quantity.ts`, `packages/domain/src/shared/unit.ts`

**完了条件**: `pnpm --filter @cookpit/domain test` が green

---

### S1-7. `packages/domain/src/product/product.repository.ts` （新規）

**対象ファイル**: `packages/domain/src/product/product.repository.ts`

**実装内容**:

```typescript
export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findAll(): Promise<Product[]>;
  save(product: Product): Promise<void>;
  delete(id: ProductId): Promise<void>;
}
```

**依存**: S1-3 (ProductId), S1-5 (Product)

**完了条件**: type-check 通過

---

### S1-8. `packages/domain/src/shared/store.repository.ts` （新規）

**対象ファイル**: `packages/domain/src/shared/store.repository.ts`

実装内容:

```typescript
export interface StoreRepository {
  findById(id: StoreId): Promise<Store | null>;
  findAll(): Promise<Store[]>;
}
```

**依存**: S1-2 (StoreId, Store)

**完了条件**: type-check 通過

---

### Phase 1 完了条件まとめ

- `pnpm --filter @cookpit/domain test` 全 green（新規テスト含む）
- `pnpm --filter @cookpit/domain type-check` 通過
- `pnpm lint` 通過（packages/domain 対象）

---

## 5. Phase 2: Infrastructure 層

### S2-1. `packages/infrastructure/src/db/schema.ts` 追記

**対象ファイル**: `packages/infrastructure/src/db/schema.ts`

**実装内容（既存 `recipes` pgTable の後に追記）**:

```
stores テーブル（pgTable）
  id          text PK
  name        text NOT NULL
  createdAt   timestamp NOT NULL DEFAULT NOW()

products テーブル（pgTable）
  id           text PK
  name         text NOT NULL
  aliases      text[] NOT NULL DEFAULT []
  category     text NOT NULL
  defaultUnit  text NOT NULL
  createdAt    timestamp NOT NULL DEFAULT NOW()
  updatedAt    timestamp NOT NULL DEFAULT NOW()

price_records テーブル（pgTable）
  id               text PK
  productId        text NOT NULL REFERENCES products(id) ON DELETE CASCADE
  storeId          text NOT NULL REFERENCES stores(id)
  priceAmount      numeric(10, 1) NOT NULL      ← U1 推奨案
  unitPriceAmount  numeric(10, 1) NOT NULL      ← U1 推奨案
  packageSizeValue numeric(10, 3) NOT NULL
  packageSizeUnit  text NOT NULL
  observedAt       timestamp NOT NULL
  createdAt        timestamp NOT NULL DEFAULT NOW()

インデックス（index() 関数使用）:
  price_records: (productId, observedAt DESC)
  price_records: (productId, storeId)
```

- Drizzle import: `numeric` を `drizzle-orm/pg-core` から追加（既存 `integer, jsonb, pgTable, text, timestamp` に加える）
- 各テーブルの `$inferSelect` / `$inferInsert` 型も export する

**依存**: Phase 1 完了（スキーマ定義に Domain 型は使わないが、内容は設計書 §7 に準拠）

**完了条件**: `pnpm --filter @cookpit/infrastructure type-check` 通過

---

### S2-2. `packages/infrastructure/src/repositories/drizzle-product.repository.ts` （新規）

**対象ファイル**: `packages/infrastructure/src/repositories/drizzle-product.repository.ts`

**実装内容**:

- `DrizzleProductRepository implements ProductRepository`
- `constructor(private readonly db: DrizzleClient) {}`

`findById(id: ProductId): Promise<Product | null>`:

- `products LEFT JOIN price_records ON products.id = price_records.product_id WHERE products.id = $id`
- Drizzle の `leftJoin` + `where(eq(products.id, id.value))` を使用
- 複数行になる（PriceRecord 数 × 1 products 行）を groupBy 等で集約するか、`findAll` と共通の `toEntity` でグルーピング処理を行う
  - 推奨: `drizzle-orm` の `select` + `leftJoin` で全行取得 → JS 側で `productId` によりグルーピング → `toEntity` でドメイン型に変換
- 結果が空 → `null` を返す

`findAll(): Promise<Product[]>`:

- `products LEFT JOIN price_records` の全件。JS 側で `productId` によりグルーピング → `map(toEntity)`
- `orderBy(products.createdAt)` で安定したソート順

`save(product: Product): Promise<void>`:

- products テーブルへの upsert: `INSERT ... ON CONFLICT DO UPDATE`（`drizzle-recipe.repository.ts` の `onConflictDoUpdate` パターン踏襲）
- `product.priceHistory` の各 PriceRecord を `price_records` テーブルへ upsert（`id` を PK として `ON CONFLICT(id) DO UPDATE SET ...`）
- 注意: `save` は add-only（既存 PriceRecord の削除は行わない）。DELETE は `delete()` メソッドのみ

`delete(id: ProductId): Promise<void>`:

- `DELETE FROM products WHERE id = $id`（`ON DELETE CASCADE` により `price_records` も自動削除）

`private toEntity(productRow, priceRecordRows): Product`:

- `drizzle-recipe.repository.ts` の `toUnit`・`toRecipeTag` と同パターンで `toUnit()`・`toProductCategory()` ヘルパー関数を定義する
- `Product.reconstruct({ id: ProductId.fromString(row.id), ..., priceHistory: [...] })`
- 各 PriceRecord は `PriceRecord.reconstruct(...)` で復元

**N+1 対策**: `findAll` / `findById` いずれも `LEFT JOIN` による単一クエリで取得する。JOIN 結果の rows を JS 側でグルーピングする方式（アプリ側 GROUP BY）を採用。100件 × 平均10件の PriceRecord で約1000行。MVP1 規模では許容範囲。

**依存**: S1-5, S1-7, S2-1, `packages/infrastructure/src/db/client.ts`

**完了条件**: `pnpm --filter @cookpit/infrastructure type-check` 通過

---

### S2-3. `packages/infrastructure/src/repositories/drizzle-store.repository.ts` （新規）

**対象ファイル**: `packages/infrastructure/src/repositories/drizzle-store.repository.ts`

**実装内容**:

- `DrizzleStoreRepository implements StoreRepository`
- `constructor(private readonly db: DrizzleClient) {}`
- `findById(id: StoreId): Promise<Store | null>`
  - `SELECT FROM stores WHERE id = $id LIMIT 1` → `Store.reconstruct(...)` or `null`
- `findAll(): Promise<Store[]>`
  - `SELECT FROM stores ORDER BY created_at` → `map(row => Store.reconstruct(...))`

**依存**: S1-2, S1-8, S2-1, `packages/infrastructure/src/db/client.ts`

**完了条件**: `pnpm --filter @cookpit/infrastructure type-check` 通過

---

### S2-4. `packages/infrastructure/src/index.ts` 追記

**対象ファイル**: `packages/infrastructure/src/index.ts`

**追記内容**（既存行に変更なし）:

```typescript
export * from './repositories/drizzle-product.repository';
export * from './repositories/drizzle-store.repository';
```

**依存**: S2-2, S2-3

**完了条件**: `pnpm --filter @cookpit/infrastructure type-check` 通過

---

### S2-5. マイグレーション生成 + Store シード

**対象**: `apps/web/` で `pnpm db:generate` を実行

**手順**:

1. S2-1 のスキーマ追記が完了した状態で `pnpm --filter @cookpit/web db:generate` を実行
2. `drizzle/migrations/` 配下に新しいマイグレーションファイルが生成されることを確認
3. Store シード SQL を別途準備する（マイグレーションファイル内またはシードスクリプトとして）:

   ```sql
   INSERT INTO stores (id, name, created_at)
   VALUES
     ('<固定UUID-A>', 'コモディイイダ', NOW()),
     ('<固定UUID-B>', 'ライフ', NOW())
   ON CONFLICT (id) DO NOTHING;
   ```

   - UUID の具体値は implementer が `randomUUID()` 等で生成して固定値として記録する
   - シード方式の選択: マイグレーションファイルに `sql` 直書き（Drizzle の `execute sql` 機能）か、別途 `seed.ts` スクリプト（`pnpm db:seed`）のどちらかを選択する。既存パターンがなければシードスクリプトを新規作成する方針とする

4. `pnpm --filter @cookpit/web db:migrate` を実行して適用確認（開発 DB 対象）

**注意**: `ON CONFLICT DO NOTHING` により同一 UUID の再投入はエラーにならない（冪等性確保）

**完了条件**:

- マイグレーションファイルが生成されている
- 開発 DB に `stores` / `products` / `price_records` テーブルが作成されている
- Store シードデータ2件が `stores` テーブルに存在する

---

### Phase 2 完了条件まとめ

- `pnpm --filter @cookpit/infrastructure type-check` 通過
- `pnpm lint`（infrastructure 対象）通過
- 開発 DB にテーブル・インデックス・シードデータが存在する

---

## 6. Phase 3: Application 層

### S3-1. `packages/application/src/product/product.dto.ts` （新規）

**対象ファイル**: `packages/application/src/product/product.dto.ts`

**実装内容**: 設計書 `contract.md §4` の DTO 定義案に準拠。`interface` 形式（`recipe.dto.ts` 踏襲）。

エクスポートする型:

- `PriceRecordDto` — storeId, storeName, priceAmount, unitPriceAmount, packageSizeValue, packageSizeUnit, observedAt（ISO 文字列）
- `ProductDto` — id, name, aliases, category, defaultUnit, priceHistory, createdAt, updatedAt
- `StoreDto` — id, name
- `CheapestStoreResultDto` — storeId, storeName, latestPrice, unitPrice
- `CreateProductInputDto` — name, aliases, category, defaultUnit
- `UpdateProductInputDto` — id, name, aliases, category, defaultUnit
- `RecordPriceInputDto` — productId, storeId, priceAmount, packageSizeValue, packageSizeUnit

`import type { ProductCategory } from '@cookpit/api-contract'` は循環依存の恐れがあるため、`ProductCategory` 型は Domain 層の `product.ts` から直接 import type するか、DTO ファイル内で再定義する。設計書 contract.md §4 は `@cookpit/api-contract` からの import を例示しているが、Application 層から api-contract への依存は避けること（依存方向: `Presentation → Application → Domain`）。DTO 内で `ProductCategory` 型が必要な場合は `@cookpit/domain/src/product/product` から `import type { ProductCategory }` とする。

**依存**: S1-5 (ProductCategory), `packages/domain/src/shared/unit.ts`

**完了条件**: `pnpm --filter @cookpit/application type-check` 通過

---

### S3-2. `packages/application/src/product/product-not-found.error.ts` （新規）

**対象ファイル**: `packages/application/src/product/product-not-found.error.ts`

**実装内容**: `recipe-not-found.error.ts` と完全に同パターン

```typescript
export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}
```

**依存**: なし

**完了条件**: type-check 通過

---

### S3-3. `packages/application/src/product/store-not-found.error.ts` （新規）

**対象ファイル**: `packages/application/src/product/store-not-found.error.ts`

**実装内容**:

```typescript
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = 'StoreNotFoundError';
  }
}
```

**依存**: なし

**完了条件**: type-check 通過

---

### S3-4. `packages/application/src/product/product.mapper.ts` （新規）

**対象ファイル**: `packages/application/src/product/product.mapper.ts`

**実装内容**: `recipe.mapper.ts` パターン踏襲

- `toProductDto(product: Product, storeMap: Map<string, string>): ProductDto`
  - `storeMap` は `storeId.value → storeName` のマップ（UseCase が StoreRepository から構築して渡す）
  - `priceHistory` の各 PriceRecord を `toPriceRecordDto(record, storeMap)` で変換
- `toPriceRecordDto(record: PriceRecord, storeMap: Map<string, string>): PriceRecordDto`
  - `storeName = storeMap.get(record.storeId.value) ?? ''`（UseCase 側で存在を保証）
- `toStoreDto(store: Store): StoreDto`

**依存**: S3-1, S1-5, S1-2

**完了条件**: `pnpm --filter @cookpit/application type-check` 通過

---

### S3-5. UseCase 8ファイル （新規）

全 UseCase は `packages/application/src/product/` 配下に配置。
パターン: `constructor` でリポジトリを受け取り、`async execute(input): Promise<output>` のみ公開。

#### `create-product.use-case.ts`

- `constructor(private readonly productRepository: ProductRepository, private readonly storeRepository: StoreRepository)`
  - ※ `GetStores`/`Create` は storeRepository 不要。`constructor(private readonly productRepository: ProductRepository)`
- `execute(input: CreateProductInputDto): Promise<ProductDto>`
  - `aliases` のトリム・空文字除去: `input.aliases.map(a => a.trim()).filter(a => a !== '')`
  - `name.trim() === ''` → throw
  - `Product.create(...)` → `productRepository.save(product)`
  - `storeMap` は空 Map（作成時は priceHistory なし）→ `toProductDto(product, new Map())`

#### `get-products.use-case.ts`

- `constructor(private readonly productRepository: ProductRepository, private readonly storeRepository: StoreRepository)`
- `execute(): Promise<ProductDto[]>`
  - `productRepository.findAll()` → 全 Store を一括取得して storeMap を構築 → `products.map(p => toProductDto(p, storeMap))`
  - Store 一括取得: `storeRepository.findAll()` → `Map<string, string>` 構築（`store.id.value → store.name`）

#### `get-product.use-case.ts`

- `execute(id: string): Promise<ProductDto>`
  - `ProductId.fromString(id)` → `productRepository.findById()` → `null` なら `ProductNotFoundError` を throw
  - storeMap を `storeRepository.findAll()` から構築 → `toProductDto`

#### `update-product.use-case.ts`

- `execute(input: UpdateProductInputDto): Promise<ProductDto>`
  - `findById` → null なら `ProductNotFoundError`
  - `aliases` トリム・空文字除去
  - `product.update({ name, aliases, category, defaultUnit })` — `Product` Entity に `update()` メソッドが必要
  - `productRepository.save(product)` → `toProductDto`

#### `delete-product.use-case.ts`

- `execute(id: string): Promise<void>`
  - U3 推奨案: `findById` → null なら `ProductNotFoundError` を throw
  - `productRepository.delete(ProductId.fromString(id))`

#### `record-price.use-case.ts`

- `constructor(private readonly productRepository: ProductRepository, private readonly storeRepository: StoreRepository)`
- `execute(input: RecordPriceInputDto): Promise<void>`
  - `priceAmount <= 0` → throw（Zod で弾くが UseCase でも防衛）
  - `packageSizeValue <= 0` → throw
  - `productRepository.findById(ProductId.fromString(input.productId))` → null なら `ProductNotFoundError`
  - U4: `storeRepository.findById(StoreId.fromString(input.storeId))` → null なら `StoreNotFoundError`
  - `UnitPriceCalculator.calculate(input.priceAmount, Quantity.of(input.packageSizeValue, input.packageSizeUnit))` → `unitPrice: Money`
  - `PriceRecord.create({ id: PriceRecordId.generate(), storeId: StoreId.fromString(input.storeId), price: Money.of(input.priceAmount, 'JPY'), unitPrice, packageSize: Quantity.of(...), observedAt: new Date() })`
  - `product.recordPrice(record)` → `productRepository.save(product)`

#### `get-cheapest-store.use-case.ts`

- `execute(productId: string): Promise<CheapestStoreResultDto | null>`
  - `findById` → null なら `ProductNotFoundError`
  - `product.cheapestStoreAt(new Date())` → `cheapestStoreId: StoreId | null`
  - null → `null` を返す
  - `storeRepository.findById(cheapestStoreId)` → Store 取得
  - `latestPriceAt(cheapestStoreId)` で最新 PriceRecord を取得
  - `CheapestStoreResultDto` を組み立てて返す

#### `get-stores.use-case.ts`

- `execute(): Promise<StoreDto[]>`
  - `storeRepository.findAll()` → `stores.map(toStoreDto)`

**依存**: S3-1〜S3-4, S1-5, S1-6, S1-7, S1-8

**完了条件**:

- `pnpm --filter @cookpit/application type-check` 通過
- UseCase の単体テスト（インメモリ Repository 使用）を実装する。テスト詳細は `docs/tests/product-master.md` 参照。Domain テストとは別に `packages/application/src/product/product-use-cases.test.ts` として実装する（`recipe-use-cases.test.ts` パターン踏襲）。
  - テスト対象: 設計書 §4 および要件書 §7 の N1〜N18, E1〜E13, B1〜B8 の UseCase に関するもの

---

### S3-6. `packages/application/src/product/index.ts` + `packages/application/src/index.ts` 追記

**対象ファイル**:

- `packages/application/src/product/index.ts` （新規）
- `packages/application/src/index.ts` （追記）

**実装内容**:

`product/index.ts`:

```typescript
export * from './create-product.use-case';
export * from './get-products.use-case';
export * from './get-product.use-case';
export * from './update-product.use-case';
export * from './delete-product.use-case';
export * from './record-price.use-case';
export * from './get-cheapest-store.use-case';
export * from './get-stores.use-case';
export * from './product.dto';
export * from './product-not-found.error';
export * from './store-not-found.error';
```

`application/index.ts` 追記:

```typescript
export * from './product';
```

**依存**: S3-5

**完了条件**:

- `pnpm --filter @cookpit/application type-check` 通過
- `pnpm --filter @cookpit/application test` が green（UseCase テスト含む）

---

### Phase 3 完了条件まとめ

- `pnpm --filter @cookpit/application type-check` 通過
- `pnpm --filter @cookpit/application test` 全 green
- `pnpm lint`（application 対象）通過

---

## 7. Phase 4: Presentation 層

### S4-1. `packages/api-contract/src/product.schema.ts` + `store.schema.ts` （新規）

**対象ファイル**:

- `packages/api-contract/src/product.schema.ts`
- `packages/api-contract/src/store.schema.ts`

**実装内容**: 設計書 `contract.md §2` の Zod スキーマ定義案に準拠。

`product.schema.ts`:

- `nonBlankString`: モジュールローカル（export しない）。`recipe.schema.ts` と同名で再定義（クロス依存回避）
- `productCategorySchema`: `z.enum([...7値...])`
- `createProductSchema`: `{ name, aliases, category, defaultUnit }`
- `updateProductSchema`: `createProductSchema` と同形
- `recordPriceSchema`: `{ storeId: z.string().uuid(), priceAmount: z.number().positive(), packageSizeValue: z.number().positive(), packageSizeUnit: unitSchema }`
- `unitSchema` は `import { unitSchema } from './recipe.schema'` で流用（再定義しない）
- 型エクスポート: `ProductCategory`, `CreateProductBody`, `UpdateProductBody`, `RecordPriceBody`

`store.schema.ts`:

- `storeSchema`: `z.object({ id: z.string().uuid(), name: z.string() })`
- 型エクスポート: `StoreSchemaType`

**Zod バージョン注意**: 既存 `recipes.ts` の param バリデーションは `z.uuid()`（Zod v4 相当）を使用している。`recordPriceSchema` の `storeId: z.string().uuid()` も同様の記法で統一する。

**依存**: `packages/api-contract/src/recipe.schema.ts`（unitSchema の import）

**完了条件**: `pnpm --filter @cookpit/api-contract type-check` 通過

---

### S4-2. `packages/api-contract/src/index.ts` 追記

**対象ファイル**: `packages/api-contract/src/index.ts`

**追記内容**（既存行に変更なし）:

```typescript
export * from './product.schema';
export * from './store.schema';
```

**依存**: S4-1

**完了条件**: `pnpm --filter @cookpit/api-contract type-check` 通過

---

### S4-3. `apps/web/src/server/routes/products.ts` （新規）

**対象ファイル**: `apps/web/src/server/routes/products.ts`

**実装内容**: `recipes.ts` パターンに準拠。

```
import { getDb } from '@/db/client';
import { createProductSchema, updateProductSchema, recordPriceSchema } from '@cookpit/api-contract';
import { CreateProductUseCase, GetProductsUseCase, GetProductUseCase,
         UpdateProductUseCase, DeleteProductUseCase, RecordPriceUseCase,
         GetCheapestStoreUseCase } from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
```

エンドポイント（設計書 §9 / contract.md §3）:

```
const idParamSchema = z.object({ id: z.uuid() });

export const productsRoute = new Hono()
  .get('/')             → GetProductsUseCase → c.json(products)
  .post('/')            → zValidator('json', createProductSchema) → CreateProductUseCase → c.json(product, 201)
  .get('/:id')          → zValidator('param', idParamSchema) → GetProductUseCase → c.json(product)
  .put('/:id')          → zValidator('param', ...) + zValidator('json', updateProductSchema) → UpdateProductUseCase → c.json(product)
  .delete('/:id')       → zValidator('param', ...) → DeleteProductUseCase → c.body(null, 204)
  .post('/:id/price-records')
                        → zValidator('param', ...) + zValidator('json', recordPriceSchema) → RecordPriceUseCase → c.body(null, 200)  ← C1 推奨案
  .get('/:id/cheapest-store')
                        → zValidator('param', ...) → GetCheapestStoreUseCase → result が null なら c.json({ data: null }) else c.json({ data: result })  ← C2 推奨案
```

DI 組み立て: Hono ルート内で手動 DI。例:

```typescript
function productRepository() {
  return new DrizzleProductRepository(getDb());
}
function storeRepository() {
  return new DrizzleStoreRepository(getDb());
}
```

**依存**: S4-1, S4-2, S3-6, S2-4

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-4. `apps/web/src/server/routes/stores.ts` （新規）

**対象ファイル**: `apps/web/src/server/routes/stores.ts`

**実装内容**:

```
export const storesRoute = new Hono()
  .get('/')  → GetStoresUseCase → c.json(stores)
```

**依存**: S3-6, S2-4

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-5. `apps/web/src/server/app.ts` 追記

**対象ファイル**: `apps/web/src/server/app.ts`

**追記内容**（既存行に変更なし）:

import 追加:

```typescript
import { productsRoute } from './routes/products';
import { storesRoute } from './routes/stores';
import { ProductNotFoundError, StoreNotFoundError } from '@cookpit/application';
```

routes 登録追加:

```typescript
const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute) // 追加
  .route('/stores', storesRoute); // 追加
```

`onError` 拡張（既存の `RecipeNotFoundError` 分岐の後に追加）:

```typescript
if (err instanceof ProductNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof StoreNotFoundError) {
  return c.json({ error: err.message }, 404);
}
```

`AppType` は `typeof routes` に自動反映されるため、変更不要。

**依存**: S4-3, S4-4

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-6. shadcn/ui chart (Recharts) 導入

**調査結果**: 現時点で `apps/web/package.json` に `recharts` が含まれておらず、`apps/web/src/components/ui/chart.tsx` も存在しない。**未導入が確定。**

**必要な手順**:

1. `recharts` パッケージの追加: `pnpm --filter @cookpit/web add recharts`
2. shadcn CLI で chart コンポーネントを生成: `pnpm dlx shadcn@latest add chart`（`apps/web/` 内で実行）
   - `apps/web/src/components/ui/chart.tsx` が生成されることを確認
3. 生成後の型チェック: `pnpm --filter @cookpit/web type-check`

**注意**:

- shadcn CLI は `shadcn.json`（または `components.json`）の設定を参照する。設定ファイルが存在しない場合は先に `pnpm dlx shadcn@latest init` が必要。既存 components（`button.tsx`, `input.tsx` 等）があることから、既に初期化済みと考えられるが、`shadcn.json` の存在を確認してから実行すること。
- `recharts` のバージョンは shadcn が推奨するバージョンを使用する（`package.json` に自動追記される）。

**完了条件**:

- `apps/web/src/components/ui/chart.tsx` が存在する
- `recharts` が `apps/web/package.json` の dependencies に追加されている
- `pnpm --filter @cookpit/web type-check` 通過

---

### S4-7. 商品一覧画面

**対象ファイル**（新規）:

- `apps/web/src/app/products/page.tsx`
- `apps/web/src/app/products/_components/product-list-client.tsx`
- `apps/web/src/app/products/_components/product-card.tsx`

**実装内容**:

`page.tsx` (Server Component):

- `dynamic = 'force-dynamic'`（`recipes/page.tsx` 踏襲）
- `DrizzleProductRepository` + `DrizzleStoreRepository` + `GetProductsUseCase` を手動 DI
- `products = await useCase.execute()`
- `<ProductListClient initialProducts={products} />`

`product-list-client.tsx` (Client Component):

- `'use client'`
- `initialProducts: ProductDto[]` を props として受け取る
- `useState` でフィルタ状態（検索ワード・カテゴリ）管理
- 一覧表示: `products.map(p => <ProductCard key={p.id} product={p} />)`
- 検索フィルタは初期表示ではクライアント側フィルタリングのみ（Hono RPC 再取得は後続でよい）
- 「追加」ボタン → `/products/new` へリンク

`product-card.tsx`:

- `product: ProductDto` を props
- 商品名・カテゴリ・defaultUnit・最終価格（`priceHistory` の最新1件の `priceAmount`）を表示
- `/products/[id]` へのリンク

**依存**: S4-5

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-8. 商品作成画面

**対象ファイル**（新規）:

- `apps/web/src/app/products/new/page.tsx`
- `apps/web/src/app/products/new/_components/product-form-client.tsx`

**実装内容**:

`new/page.tsx` (Server Component):

- 初期データ取得なし（`recipes/new/page.tsx` 踏襲）
- `<ProductFormClient />`

`product-form-client.tsx` (Client Component):

- `'use client'`
- フォーム項目: name（テキスト）、aliases（カンマ区切りテキスト → `split(',').map(trim).filter(Boolean)`）、category（セレクト: `productCategorySchema.options`）、defaultUnit（セレクト: `unitSchema.options`）
- 送信: `client.api.products.$post({ json: body })` → 成功後 `router.push('/products')`
- エラー表示: Zod バリデーション失敗 or サーバーエラーをインライン表示

**依存**: S4-5

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-9. 商品詳細画面

**対象ファイル**（新規）:

- `apps/web/src/app/products/[id]/page.tsx`
- `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`
- `apps/web/src/app/products/[id]/_components/price-history-chart.tsx`

**実装内容**:

`[id]/page.tsx` (Server Component):

- `dynamic = 'force-dynamic'`
- `params: Promise<{ id: string }>` を受け取る（`recipes/[id]/page.tsx` 踏襲）
- `GetProductUseCase` + `GetCheapestStoreUseCase` を手動 DI（両方とも `DrizzleProductRepository` + `DrizzleStoreRepository` を使用）
- `ProductNotFoundError` を catch して `notFound()` を呼ぶ
- `product: ProductDto` と `cheapestStore: CheapestStoreResultDto | null` を `ProductDetailClient` に渡す

`product-detail-client.tsx` (Client Component):

- `'use client'`
- props: `product: ProductDto`, `cheapestStore: CheapestStoreResultDto | null`
- 商品情報表示（name, category, aliases, defaultUnit）
- 最安店舗表示（cheapestStore が null なら「価格記録なし」）
- `PriceHistoryChart` コンポーネントに `priceHistory` を渡してグラフ描画
- 価格記録フォーム（インライン）:
  - フォーム項目: storeId（セレクト: `GetStoresUseCase` 結果 — 初期表示に必要なので `useEffect` で `client.api.stores.$get()` を呼ぶ）、priceAmount（数値）、packageSizeValue（数値）、packageSizeUnit（セレクト）
  - 送信: `client.api.products[':id']['price-records'].$post({ json: body })` → TanStack Query の invalidate または `router.refresh()`
- 「編集」ボタン → `/products/[id]/edit` へリンク

`price-history-chart.tsx`:

- `'use client'`
- props: `priceHistory: PriceRecordDto[]`
- shadcn/ui chart（`LineChart` from recharts）を使用
- X 軸: `observedAt`（時系列）、Y 軸: `unitPriceAmount`（円）
- 系列: `storeName` で色分け
- 価格記録なし（空配列）の場合は「価格記録がありません」メッセージを表示

**注意**: TanStack Query は現在 `package.json` に未記載の可能性がある。使用する場合は事前に依存を確認・追加する。使用しない場合は `router.refresh()` で代替可能（Server Component 再レンダリングによるデータ更新）。

**依存**: S4-5, S4-6

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### S4-10. 商品編集画面

**対象ファイル**（新規）:

- `apps/web/src/app/products/[id]/edit/page.tsx`
- `apps/web/src/app/products/[id]/edit/_components/product-edit-form-client.tsx`

**実装内容**:

`edit/page.tsx` (Server Component):

- `dynamic = 'force-dynamic'`
- `GetProductUseCase` で商品取得。`ProductNotFoundError` → `notFound()`
- `<ProductEditFormClient product={product} />`

`product-edit-form-client.tsx` (Client Component):

- `'use client'`
- props: `product: ProductDto`（初期値プリフィル）
- フォーム項目: `product-form-client.tsx` と同形。初期値は `product` から設定
- aliases はカンマ区切りで表示 → 送信時に `split(',')` で配列化
- 送信: `client.api.products[':id'].$put({ param: { id }, json: body })` → 成功後 `router.push('/products/' + id)`

**依存**: S4-5

**完了条件**: `pnpm --filter @cookpit/web type-check` 通過

---

### Phase 4 完了条件まとめ

- `pnpm --filter @cookpit/web type-check` 通過
- `pnpm lint`（web 対象）通過
- ブラウザで4画面すべてが表示できること（手動確認）

---

## 8. テスト計画の連携

テストケースの詳細設計は test-designer の `docs/tests/product-master.md` を参照すること。本計画と重複するため、詳細なテストケース一覧はここに記載しない。

**implementer が実装する前提のテスト**:

| 対象                                 | ファイルパス                                                 | テスト種別                             |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| `Money` 値オブジェクト               | `packages/domain/src/shared/money.test.ts`                   | Domain 単体テスト（Vitest co-located） |
| `StoreId` 値オブジェクト             | `packages/domain/src/shared/store.test.ts`                   | Domain 単体テスト                      |
| `ProductId` 値オブジェクト           | `packages/domain/src/product/product-id.test.ts`             | Domain 単体テスト                      |
| `Product` 集約 + `PriceRecord`       | `packages/domain/src/product/product.test.ts`                | Domain 単体テスト                      |
| `UnitPriceCalculator`                | `packages/domain/src/product/unit-price-calculator.test.ts`  | Domain 単体テスト                      |
| UseCase 8本（インメモリ Repository） | `packages/application/src/product/product-use-cases.test.ts` | Application 単体テスト                 |

**Application / Infrastructure 層の自動テスト整備は後続フェーズ**（`coding-standards.md` 準拠）。

---

## 9. リスクとロールバック

### マイグレーション失敗時のロールバック

- Drizzle の `db:migrate` 失敗時: Drizzle は逐次適用なので、失敗したマイグレーションファイルを削除してスキーマを元に戻す。
- 新規テーブルのみを追加する変更（既存 `recipes` テーブルへの変更なし）のため、ロールバックは `DROP TABLE IF EXISTS price_records, products, stores;` で安全に戻せる。
- 本番環境では `pnpm db:migrate` を先行実行し、Next.js デプロイ前に検証すること。

### ProductId 互換（Recipe との境界）

- `recipe-ingredient.ts` 内の `interface ProductId { readonly value: string }` を削除しない。
- 正式 `ProductId` クラスの `{ readonly value: string }` は TypeScript 構造的部分型により互換。
- Sprint 2 では Recipe 集約を一切変更しない。もし型エラーが生じた場合は implementer が Orchestrator に差し戻すこと。

### N+1 リスク（JOIN 復元）

- `findAll()` で `products LEFT JOIN price_records` による全件取得を行う。MVP1 規模（100件 × 10件 = 1000行程度）では問題なし。
- `findById()` も同様。単一商品の price_records 件数が増えても影響は限定的。
- 将来的に件数が増加した場合は Repository のクエリを最適化する（pagination または個別の price_records クエリへの分割）。

### shadcn/ui chart 導入の影響

- `recharts` 追加による `node_modules` 肥大化・ビルドサイズ増加が生じる可能性がある。
- shadcn CLI が `chart.tsx` 以外のファイルを生成・上書きする場合があるため、生成後の差分を確認する。
- 問題が生じた場合は chart 機能のみ無効化（`price-history-chart.tsx` でプレースホルダー表示に差し替え）してデプロイし、後続スプリントで対応する。

### TanStack Query 未導入

- `apps/web/package.json` に `@tanstack/react-query` が未記載の場合、価格記録フォーム送信後のキャッシュ無効化に `router.refresh()` を使用する。
- Server Component の `dynamic = 'force-dynamic'` と組み合わせると毎回 Server Component が再実行されるため、データ整合性は保たれる。

---

## 10. ドキュメント更新箇所

実装完了後に更新・確認が必要なドキュメント:

| ドキュメント                              | 更新内容                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `docs/designs/product-master.md`          | ステータスを `draft` → `approved` に更新（architecture-designer の責務）   |
| `docs/designs/product-master.contract.md` | 同上                                                                       |
| `docs/04-domain-model.md`                 | Product / PriceRecord / Store / Money が実装済みとなったことを記録（任意） |
| `docs/05-roadmap.md`                      | Sprint 2 完了マーク                                                        |

---

## 11. 全体完了条件

以下がすべて満たされた時点で Sprint 2 完了とする。

1. Phase 1〜4 の全ステップが完了している
2. `pnpm lint` 全 green
3. `pnpm type-check`（モノレポ全体）全 green
4. `pnpm test`（モノレポ全体）全 green（Domain + Application の新規テスト含む）
5. 4画面（商品一覧・作成・詳細・編集）がブラウザで動作することを手動確認
6. Store シード2件（コモディイイダ・ライフ）が `stores` テーブルに存在すること
7. 既存 `/api/recipes` エンドポイントが引き続き正常動作すること（後方互換確認）
