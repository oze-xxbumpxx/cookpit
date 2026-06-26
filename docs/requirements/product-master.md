# 要件定義: Product マスタ + 価格履歴（Sprint 2）

作成日: 2026-06-26  
対象スプリント: Sprint 2  
変更レベル: L3（複数層・複数パッケージにまたがる新機能）

---

## 1. 要求の要約

商品マスタ（Product）と店舗別の価格履歴（PriceRecord）を管理する機能を実装する。
ユーザーが商品を登録し、買い物ごとに価格を記録することで、店舗間の価格比較と
最安店舗の提示を実現する。将来の ShoppingList 自動生成・最安提案機能の基盤となる。

---

## 2. 確定している前提・制約

### ドメインモデル（変更不可）

- `Product` 集約は `docs/04-domain-model.md` の仕様を正典とする。
  - フィールド: `id`, `name`, `aliases: string[]`, `category: ProductCategory`, `defaultUnit: Unit`, `priceHistory: PriceRecord[]`
  - `PriceRecord` は `storeId`, `price: Money`, `unitPrice: Money`, `packageSize: Quantity`, `observedAt: Date` を持つ。
- `Store` は MVP1 でシード2件のみ。動的追加は Phase 2 以降。
  - シードデータ: `コモディイイダ` / `ライフ`（各 UUID を割り当てて stores テーブルに投入）
- `Money` は `amount >= 0` の制約を持つ（`Money.of` が非負チェックを行う）。
- `Quantity` は `value >= 0` の制約を持つ（`Quantity.of` が非負チェックを行う）。

### ProductCategory（確定・列挙）

```
'野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | 'その他'
```

### unitPrice 計算ルール（確定）

価格記録時に「合計金額（priceAmount）+ 内容量（packageSizeValue + packageSizeUnit）」を入力し、Application 層で自動計算する。

| 単位種別 | 基準 | 計算式 |
|---|---|---|
| 重量系（g / kg） | 100g あたり | `priceAmount / packageSizeInGrams * 100` |
| 容量系（ml / l） | 100ml あたり | `priceAmount / packageSizeInMl * 100` |
| 個数系・調理単位（その他の Unit） | 1単位あたり | `priceAmount / packageSizeValue` |

- 重量系: kg は g に変換（1kg = 1000g）して計算。
- 容量系: l は ml に変換（1l = 1000ml）して計算。
- 個数系・調理単位: `大さじ` `小さじ` `cup` `個` `本` `枚` `玉` `尾` `切れ` `束` `袋` `缶` `合` が該当。

### aliases フォーム

カンマ区切りテキスト入力（例: `玉ねぎ,タマネギ,オニオン`）を Presentation 層でパースして `string[]` に変換する。空文字・空白のみのエントリは除去する。

### 画面構成（確定）

| 画面 | パス | 初期データ取得 | ミューテーション |
|---|---|---|---|
| 商品一覧 | `/products` | Server Component（GetProductsUseCase 直接呼び出し） | Hono RPC（Client 検索フィルタ） |
| 商品作成 | `/products/new` | — | Hono RPC POST `/api/products` |
| 商品詳細 | `/products/[id]` | Server Component（GetProductUseCase + GetCheapestStoreUseCase 直接呼び出し） | Hono RPC POST `/api/products/:id/price-records`（価格記録インラインフォーム） |
| 商品編集 | `/products/[id]/edit` | Server Component（GetProductUseCase 直接呼び出し） | Hono RPC PUT `/api/products/:id` |

### 価格履歴グラフ

shadcn/ui chart（Recharts）の折れ線グラフ。X軸: 観測日時（時系列）、Y軸: unitPrice（円）、系列: 店舗別色分け。

### アーキテクチャ制約

- 依存方向: `Presentation → Application → Domain ← Infrastructure`
- `packages/domain` は他パッケージに依存しない。
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`。
- UseCase は 1 クラス・`execute()` のみ。手動 DI（コンストラクタ注入）。
- DI 組み立ては呼び出し側（Hono ルート / Server Component）で行う。
- `any` 禁止・default export 禁止・`import type` 必須（型のみインポート時）・`null` 統一。

---

## 3. 機能要件

### 3-1. UseCase 一覧と入出力・制約

#### CreateProductUseCase

| 項目 | 内容 |
|---|---|
| Input | `name: string`, `aliases: string[]`, `category: ProductCategory`, `defaultUnit: Unit` |
| Output | `ProductDto` |
| 前提 | なし |
| バリデーション | `name` は空白不可（trim 後 1文字以上）。`category` は確定列挙値のみ。`defaultUnit` は `Unit` 型の確定値のみ。`aliases` は空配列許容。各 alias は空白トリム後に空なら除去。 |
| ドメイン操作 | `Product.create()` 呼び出し → `ProductRepository.save()` |
| エラー | バリデーション違反は UseCase 入口で `Error` を throw |

#### GetProductsUseCase

| 項目 | 内容 |
|---|---|
| Input | なし |
| Output | `ProductDto[]` |
| 前提 | なし |
| バリデーション | なし |
| ドメイン操作 | `ProductRepository.findAll()` |
| エラー | なし |

#### GetProductUseCase

| 項目 | 内容 |
|---|---|
| Input | `id: string`（UUID） |
| Output | `ProductDto` |
| 前提 | 対象 Product が存在すること |
| バリデーション | `id` の UUID 形式チェックは Hono ルート層で行う |
| ドメイン操作 | `ProductRepository.findById()` |
| エラー | 存在しない場合 `ProductNotFoundError` を throw（Recipe パターンと同様） |

#### UpdateProductUseCase

| 項目 | 内容 |
|---|---|
| Input | `id: string`, `name: string`, `aliases: string[]`, `category: ProductCategory`, `defaultUnit: Unit` |
| Output | `ProductDto` |
| 前提 | 対象 Product が存在すること |
| バリデーション | `name` 空白不可。`category`/`defaultUnit` は確定列挙値のみ。`aliases` 空配列許容。 |
| ドメイン操作 | `ProductRepository.findById()` → Entity メソッドで更新 → `ProductRepository.save()` |
| エラー | 存在しない場合 `ProductNotFoundError` を throw |

#### DeleteProductUseCase

| 項目 | 内容 |
|---|---|
| Input | `id: string` |
| Output | `void` |
| 前提 | 対象 Product が存在すること（存在チェックの方針は未決: 下記参照） |
| バリデーション | `id` UUID チェックは Hono ルート層 |
| ドメイン操作 | `ProductRepository.delete()` |
| エラー | 未決: 存在しない ID に対して `ProductNotFoundError` を throw するか、冪等的に成功扱いするか |

#### RecordPriceUseCase

| 項目 | 内容 |
|---|---|
| Input | `productId: string`, `storeId: string`, `priceAmount: number`, `packageSizeValue: number`, `packageSizeUnit: Unit` |
| Output | `void` |
| 前提 | 対象 Product および Store が存在すること |
| バリデーション | `priceAmount > 0`（非負かつ非ゼロ）。`packageSizeValue > 0`。`storeId` は存在する Store の ID。`packageSizeUnit` は `Unit` 列挙値のみ。 |
| ドメイン操作 | `unitPrice` 計算（Application 層）→ `Product.recordPrice(PriceRecord)` → `ProductRepository.save()` |
| エラー | `priceAmount <= 0` / `packageSizeValue <= 0` / Store 不存在時はエラー。未決: Store 不存在時は `StoreNotFoundError` を投げるか、バリデーションで事前に弾くか |

#### GetCheapestStoreUseCase

| 項目 | 内容 |
|---|---|
| Input | `productId: string` |
| Output | `{ storeId: string, storeName: string, latestPrice: number, unitPrice: number } \| null` |
| 前提 | 対象 Product が存在すること。価格記録が 1件以上あれば結果を返す。ゼロ件なら `null`。 |
| バリデーション | `productId` UUID チェックは Hono ルート層 |
| ドメイン操作 | `Product.cheapestStoreAt(new Date())` → Store 名前解決（`StoreRepository.findById()`） |
| エラー | Product 不存在時は `ProductNotFoundError` を throw |

#### GetStoresUseCase

| 項目 | 内容 |
|---|---|
| Input | なし |
| Output | `StoreDto[]`（`{ id: string, name: string }`） |
| 前提 | stores テーブルにシードデータが投入済みであること |
| バリデーション | なし |
| ドメイン操作 | `StoreRepository.findAll()` |
| エラー | なし |

### 3-2. ProductDto の構造

```
ProductDto {
  id: string
  name: string
  aliases: string[]
  category: ProductCategory
  defaultUnit: Unit
  priceHistory: PriceRecordDto[]
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
}

PriceRecordDto {
  storeId: string
  storeName: string   // 未決: UseCase が解決するか、フロントで別途取得するか
  priceAmount: number
  unitPriceAmount: number
  packageSizeValue: number
  packageSizeUnit: Unit
  observedAt: string  // ISO 8601
}
```

### 3-3. Store シード運用方針

- `stores` テーブルに `コモディイイダ` / `ライフ` の2件を migration または seed スクリプトで投入する。
- シード投入は冪等性を保つ（INSERT ... ON CONFLICT DO NOTHING 相当）。重複投入時はエラーにしない。
- シード ID は固定 UUID とするか、自動採番かは未決（下記参照）。

### 3-4. API エンドポイント一覧

| メソッド | パス | UseCase | 説明 |
|---|---|---|---|
| GET | `/api/products` | GetProductsUseCase | 商品一覧 |
| POST | `/api/products` | CreateProductUseCase | 商品作成 |
| GET | `/api/products/:id` | GetProductUseCase | 商品詳細 |
| PUT | `/api/products/:id` | UpdateProductUseCase | 商品更新 |
| DELETE | `/api/products/:id` | DeleteProductUseCase | 商品削除 |
| POST | `/api/products/:id/price-records` | RecordPriceUseCase | 価格記録 |
| GET | `/api/products/:id/cheapest-store` | GetCheapestStoreUseCase | 最安店舗取得 |
| GET | `/api/stores` | GetStoresUseCase | 店舗一覧 |

---

## 4. 非機能要件

### 4-1. unitPrice 計算精度・丸め方針

- JavaScript `number`（IEEE 754 double）で計算するため、小数点以下の誤差が生じる可能性がある。
- 未決: 丸め桁数の方針（例: 小数点以下2桁で `Math.round` か `Math.floor` か）。
  - 論点: 「1袋 137円 / 300g = 0.4567円/g → 100gあたり 45.67円」をどう表示・保存するか。
  - 推奨候補: 小数点以下1桁（`Math.round(unitPrice * 10) / 10`）で保存し、表示は整数。設計者判断を要する。
- `Money.of` は `amount < 0` で throw するため、計算結果が負にならないことは前提として成立する（`priceAmount > 0` かつ `packageSizeValue > 0` を入口で保証する）。

### 4-2. Store シード冪等性

- シード投入は開発環境・本番環境ともに `INSERT ... ON CONFLICT DO NOTHING` で冪等にする。
- 既存レコードの名称変更は行わない（シード後は手動変更不可）。

### 4-3. 価格記録の重複可否

- 未決: 同一 productId + storeId + 同日付の価格記録を複数登録できるか。
  - `PriceRecord` は observedAt で管理するため、同日同店の記録が複数あっても技術的には支障なし。
  - ドメインルール上での制約は現時点で定義なし。

### 4-4. パフォーマンス

- MVP1 対象: 2名利用・週1回の買い物。Product 数は100件程度、PriceRecord は数百件規模。
- `priceHistory` を集約内に保持する設計でパフォーマンス問題は生じない（docs/04-domain-model.md に記載済み）。

---

## 5. 影響範囲

### 5-1. 新規作成が必要なファイル（設計・実装は architecture-designer / implementer の責務）

**packages/domain/src/product/**
- `product-id.ts` — ProductId 値オブジェクト（RecipeId パターン踏襲）
- `product.ts` — Product 集約・PriceRecord 値オブジェクト
- `product.repository.ts` — ProductRepository インターフェース

**packages/domain/src/shared/**
- `store.ts` — Store Entity・StoreId 値オブジェクト（docs/04-domain-model.md 仕様あり）
- `money.ts` — Money 値オブジェクト（docs/04-domain-model.md 仕様あり）

**packages/application/src/product/**
- `product.dto.ts` — ProductDto / PriceRecordDto / StoreDto / 各 InputDto
- `product.mapper.ts` — Entity ↔ DTO 変換
- `product-not-found.error.ts` — ProductNotFoundError（RecipeNotFoundError パターン踏襲）
- `create-product.use-case.ts`
- `get-products.use-case.ts`
- `get-product.use-case.ts`
- `update-product.use-case.ts`
- `delete-product.use-case.ts`
- `record-price.use-case.ts`
- `get-cheapest-store.use-case.ts`
- `get-stores.use-case.ts`
- `index.ts`

**packages/infrastructure/src/repositories/**
- `drizzle-product.repository.ts` — DrizzleProductRepository
- `drizzle-store.repository.ts` — DrizzleStoreRepository

**packages/api-contract/src/**
- `product.schema.ts` — Zod スキーマ（createProductSchema / updateProductSchema / recordPriceSchema）
- `store.schema.ts` — Zod スキーマ（storeSchema）

**apps/web/src/server/routes/**
- `products.ts` — Hono ルート（recipes.ts パターン踏襲）
- `stores.ts` — Hono ルート

**apps/web/src/app/(app)/products/**
- `page.tsx` — 商品一覧
- `new/page.tsx` — 商品作成フォーム
- `[id]/page.tsx` — 商品詳細（価格グラフ + 価格記録フォーム）
- `[id]/edit/page.tsx` — 商品編集フォーム

### 5-2. 既存ファイルへの追記が必要な箇所

| ファイル | 変更内容 |
|---|---|
| `packages/infrastructure/src/db/schema.ts` | `products` テーブル・`stores` テーブル・`price_records` テーブルの Drizzle スキーマ追加。現在は `recipes` テーブルのみ。 |
| `packages/application/src/index.ts` | `export * from './product';` を追加 |
| `packages/infrastructure/src/index.ts` | `DrizzleProductRepository` / `DrizzleStoreRepository` の re-export 追加 |
| `packages/api-contract/src/index.ts` | `export * from './product.schema';` / `export * from './store.schema';` 追加 |
| `apps/web/src/server/app.ts` | `productsRoute` / `storesRoute` の `.route()` 登録追加。`onError` に `ProductNotFoundError` ハンドリングを追加（現在は `RecipeNotFoundError` のみ）。 |

### 5-3. Recipe 集約との関係

- `packages/domain/src/recipe/recipe-ingredient.ts` の `productRef` は現在 `{ value: string } | null` という形で ProductId を文字列として保持している（実際の型は `interface ProductId { readonly value: string }` として recipe-ingredient.ts 内に定義）。
- Product 集約実装後も、RecipeIngredient.productRef は `{ value: string } | null` のまま維持する（domain 内での型は将来 `ProductId` 型に統一することがあるが、Sprint 2 スコープ外）。
- Sprint 2 では Recipe 集約への変更は行わない。

### 5-4. 将来の連携（スコープ外・記録のみ）

- **ShoppingList 連携**: `Product.cheapestStoreAt()` は `docs/04-domain-model.md` の `GenerateShoppingListUseCase` で利用される。`GetCheapestStoreUseCase` はその API 版として機能する。
- **Pantry 連携**: `CompleteShoppingUseCase` で買い物完了時に `Product.recordPrice()` を呼ぶフロー（docs/04-domain-model.md 参照）。Sprint 2 の `RecordPriceUseCase` はこの手動版として先行実装する。
- **MealPlan 連携**: 直接の依存なし。

---

## 6. 未決事項（設計判断が必要）

| # | 未決事項 | 論点・選択肢 | 確認先 |
|---|---|---|---|
| U1 | unitPrice の丸め桁数・丸め方式 | 小数点以下何桁で保存するか。`Math.round` / `Math.floor` のどちらか。Money は `number` 型なので DB 側のカラム型（`integer` か `numeric` か `real` か）にも影響する。 | ユーザー（またはアーキテクチャ設計者） |
| U2 | Store シード ID の固定化可否 | UUID を固定値（hardcoded）にするか、マイグレーション時に自動採番するか。固定 UUID にすると再現性が高いが、テスト環境での衝突リスクがある。 | アーキテクチャ設計者 |
| U3 | DeleteProductUseCase の存在チェック | 存在しない ID で DELETE 呼び出した場合、`ProductNotFoundError` にするか冪等的に 204 を返すか。Recipe パターン（GetRecipe は NotFound エラー）との一貫性を考えると前者が自然。 | ユーザー |
| U4 | RecordPriceUseCase の Store 存在検証 | `storeId` が有効かどうかを UseCase 内で `StoreRepository.findById()` して検証するか、Zod スキーマでフロント側の選択肢を制限するだけにするか。 | アーキテクチャ設計者 |
| U5 | 価格記録の重複可否 | 同日・同店・同商品の価格記録が複数登録できることを許可するか。許可するなら「最新1件を表示」の定義が observedAt の精度に依存する。 | ユーザー |
| U6 | PriceRecordDto の storeName 解決 | `ProductDto.priceHistory` に `storeName` を含めるか。含めるなら UseCase または Mapper で `StoreRepository` を使って解決する必要がある。含めない場合、フロントは `GetStoresUseCase` 結果と storeId でジョインする。 | アーキテクチャ設計者 |
| U7 | price_records テーブル設計 | PriceRecord を Product テーブルの JSONB カラムに格納するか（Recipe の ingredients と同様）、独立テーブルにするか。データ量・クエリ方針に影響する。Recipe パターン（JSONB）に合わせるとシンプルだが、将来のクエリ柔軟性が低い。 | アーキテクチャ設計者 |

---

## 7. 試験観点

### 7-1. 正常系

| No | ケース | 確認内容 |
|---|---|---|
| N1 | `CreateProductUseCase` — 全フィールド指定 | ProductDto が返り、id が UUID 形式、aliases が配列として格納される |
| N2 | `CreateProductUseCase` — aliases 空配列 | aliases = [] で正常に作成できる |
| N3 | `GetProductsUseCase` — 商品あり | 全件 ProductDto[] が返る |
| N4 | `GetProductsUseCase` — 商品なし | 空配列 `[]` が返る |
| N5 | `GetProductUseCase` — 存在する ID | 対象 ProductDto が返る |
| N6 | `UpdateProductUseCase` — 全フィールド更新 | ProductDto の全フィールドが更新後の値になる |
| N7 | `UpdateProductUseCase` — aliases を空配列に更新 | aliases = [] に更新できる |
| N8 | `DeleteProductUseCase` — 存在する ID | void（例外なし）、その後 GetProductUseCase で NotFound になる |
| N9 | `RecordPriceUseCase` — 重量系（g） | unitPrice = priceAmount / packageSizeValue * 100 (per 100g) |
| N10 | `RecordPriceUseCase` — 重量系（kg） | kg を g に変換して計算（1kg=1000g） |
| N11 | `RecordPriceUseCase` — 容量系（ml） | unitPrice = priceAmount / packageSizeValue * 100 (per 100ml) |
| N12 | `RecordPriceUseCase` — 容量系（l） | l を ml に変換して計算（1l=1000ml） |
| N13 | `RecordPriceUseCase` — 個数系（個） | unitPrice = priceAmount / packageSizeValue (per 1個) |
| N14 | `RecordPriceUseCase` — 調理単位（大さじ） | unitPrice = priceAmount / packageSizeValue (per 1大さじ) |
| N15 | `GetCheapestStoreUseCase` — 価格記録あり・単一店舗 | その店舗の情報が返る |
| N16 | `GetCheapestStoreUseCase` — 価格記録あり・複数店舗 | 最も unitPrice が低い店舗が返る |
| N17 | `GetCheapestStoreUseCase` — 価格記録なし | null が返る |
| N18 | `GetStoresUseCase` | シードデータ2件（コモディイイダ・ライフ）が返る |

### 7-2. 異常系

| No | ケース | 期待される挙動 |
|---|---|---|
| E1 | `CreateProductUseCase` — name が空文字 | Error を throw（`'Product name is required'` 相当） |
| E2 | `CreateProductUseCase` — name が空白のみ | trim 後空文字のため Error を throw |
| E3 | `CreateProductUseCase` — category が不正値 | Error を throw（Hono ルート層の Zod バリデーションで 400 Bad Request） |
| E4 | `CreateProductUseCase` — defaultUnit が不正値 | Error を throw（Zod バリデーションで 400 Bad Request） |
| E5 | `GetProductUseCase` — 存在しない ID | `ProductNotFoundError` を throw → Hono `onError` で 404 応答 |
| E6 | `UpdateProductUseCase` — 存在しない ID | `ProductNotFoundError` を throw → 404 応答 |
| E7 | `DeleteProductUseCase` — 存在しない ID | 未決（U3 の判断による） |
| E8 | `RecordPriceUseCase` — priceAmount = 0 | Error を throw（`priceAmount` は 0 超必須） |
| E9 | `RecordPriceUseCase` — priceAmount < 0 | Error を throw（Money 非負制約と入口バリデーション） |
| E10 | `RecordPriceUseCase` — packageSizeValue = 0 | Error を throw（ゼロ除算防止・正数制約） |
| E11 | `RecordPriceUseCase` — 存在しない productId | `ProductNotFoundError` を throw → 404 応答 |
| E12 | `RecordPriceUseCase` — 存在しない storeId | 未決（U4 の判断による） |
| E13 | `GetCheapestStoreUseCase` — 存在しない productId | `ProductNotFoundError` を throw → 404 応答 |

### 7-3. 境界値

| No | ケース | 確認内容 |
|---|---|---|
| B1 | unitPrice 計算: 重量系/容量系/個数系の単位切り替え | g・kg・ml・l と個数系で計算基準が正しく切り替わること |
| B2 | priceAmount = 0.01（最小正数） | Money.of(0.01, 'JPY') が成功し、unitPrice も正の値になること |
| B3 | packageSizeValue = 0.001（最小正数） | Quantity.of(0.001, 'g') が成功し、計算結果がゼロ除算にならないこと |
| B4 | aliases に空文字を含む配列 `['', '玉ねぎ', '  ']` | トリム・除去後 `['玉ねぎ']` として扱われること |
| B5 | aliases = [] | 空配列で作成・更新が可能なこと |
| B6 | priceHistory 0件の Product | GetProductUseCase は返却し、GetCheapestStoreUseCase は null を返すこと |
| B7 | 同一商品に複数店舗の価格記録 | cheapestStoreAt が unitPrice 比較で正しく最安を返すこと |
| B8 | Store シード重複投入 | 冪等的にエラーなく完了すること（ON CONFLICT DO NOTHING） |

---

## 8. 参照ファイル（主要なもの）

既存実装パターンの参照先:

- `/home/user/cookpit/docs/04-domain-model.md` — Product 集約・Money・Store・PriceRecord の正典仕様
- `/home/user/cookpit/docs/03-architecture.md` — 層構成・依存方向・DI 方針
- `/home/user/cookpit/packages/domain/src/recipe/recipe.ts` — create/reconstruct パターン
- `/home/user/cookpit/packages/domain/src/recipe/recipe-ingredient.ts` — ProductId の現在の定義（`{ value: string } | null`）
- `/home/user/cookpit/packages/domain/src/shared/quantity.ts` — Quantity 値オブジェクト
- `/home/user/cookpit/packages/domain/src/shared/unit.ts` — Unit 型定義（全列挙値）
- `/home/user/cookpit/packages/application/src/recipe/create-recipe.use-case.ts` — UseCase パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe.dto.ts` — DTO パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe.mapper.ts` — Mapper パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe-not-found.error.ts` — NotFoundError パターン
- `/home/user/cookpit/packages/application/src/recipe/index.ts` — re-export パターン
- `/home/user/cookpit/packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` — Repository 実装パターン
- `/home/user/cookpit/packages/infrastructure/src/db/schema.ts` — Drizzle スキーマ（現在は recipes テーブルのみ）
- `/home/user/cookpit/packages/api-contract/src/recipe.schema.ts` — Zod スキーマパターン
- `/home/user/cookpit/apps/web/src/server/routes/recipes.ts` — Hono ルートパターン
- `/home/user/cookpit/apps/web/src/server/app.ts` — Hono アプリ・onError ハンドリング（追記対象）
- `/home/user/cookpit/packages/application/src/index.ts` — application re-export（追記対象）
- `/home/user/cookpit/packages/infrastructure/src/index.ts` — infrastructure re-export（追記対象）
- `/home/user/cookpit/packages/api-contract/src/index.ts` — api-contract re-export（追記対象）
