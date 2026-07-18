# 設計書: product-master

- ステータス: draft
- レベル: L3
- 関連: `docs/requirements/product-master.md`（要件定義）、`docs/04-domain-model.md`、`docs/03-architecture.md`

---

## 1. 目的

商品マスタ（Product）と店舗別価格履歴（PriceRecord）を管理する機能を実装する。
ユーザーが商品を登録し、買い物ごとに価格を記録することで、店舗間の価格比較と最安店舗の提示を実現する。
将来の ShoppingList 自動生成・最安提案機能（GenerateShoppingListUseCase）の基盤となる。

---

## 2. 要件（設計観点での要約）

### 機能要件

- Product CRUD（CreateProduct / GetProducts / GetProduct / UpdateProduct / DeleteProduct）
- 価格記録（RecordPriceUseCase）: priceAmount + packageSize から unitPrice を自動計算して PriceRecord に追加
- 最安店舗取得（GetCheapestStoreUseCase）: 店舗ごとの最新 unitPrice を比較して最安を返す
- 店舗一覧取得（GetStoresUseCase）: MVP1 はシード2件（コモディイイダ・ライフ）固定

### ドメインモデル上の確定事項

- Product 集約は `priceHistory: PriceRecord[]` を集約内に保持する（`docs/04-domain-model.md` 正典）
- Store は Product から独立した集約。Product → Store の参照は `storeId`（ID 参照）のみ
- ProductCategory は `'野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | 'その他'` の確定列挙
- Unit は `packages/domain/src/shared/unit.ts` の確定列挙（既存の Quantity と同一型を使用）

### 画面構成

| 画面     | パス                  | 初期データ取得                                                               | ミューテーション                                |
| -------- | --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| 商品一覧 | `/products`           | Server Component（GetProductsUseCase 直接呼び出し）                          | Hono RPC（Client 検索フィルタ）                 |
| 商品作成 | `/products/new`       | —                                                                            | Hono RPC POST `/api/products`                   |
| 商品詳細 | `/products/[id]`      | Server Component（GetProductUseCase + GetCheapestStoreUseCase 直接呼び出し） | Hono RPC POST `/api/products/:id/price-records` |
| 商品編集 | `/products/[id]/edit` | Server Component（GetProductUseCase 直接呼び出し）                           | Hono RPC PUT `/api/products/:id`                |

---

## 3. 変更後構成

実態パスに基づく。`apps/web/src/app/` に `(app)` グループセグメントは存在しない（`apps/web/src/app/recipes/` が実態であることを確認済み）。

```
packages/
├── domain/src/
│   ├── product/                          # 新規ディレクトリ
│   │   ├── product-id.ts                 # 新規: ProductId 値オブジェクト（RecipeId パターン踏襲）
│   │   ├── product.ts                    # 新規: Product 集約・PriceRecord 値オブジェクト
│   │   └── product.repository.ts         # 新規: ProductRepository インターフェース
│   └── shared/
│       ├── money.ts                      # 新規: Money 値オブジェクト（docs/04-domain-model.md 仕様）
│       ├── store.ts                      # 新規: Store Entity・StoreId 値オブジェクト
│       ├── quantity.ts                   # 変更なし（既存）
│       └── unit.ts                       # 変更なし（既存）
│
├── application/src/
│   ├── product/                          # 新規ディレクトリ
│   │   ├── product.dto.ts                # 新規: ProductDto / PriceRecordDto / StoreDto / InputDto
│   │   ├── product.mapper.ts             # 新規: Entity ↔ DTO 変換
│   │   ├── product-not-found.error.ts    # 新規: ProductNotFoundError
│   │   ├── store-not-found.error.ts      # 新規: StoreNotFoundError（U4 推奨案による）
│   │   ├── create-product.use-case.ts    # 新規
│   │   ├── get-products.use-case.ts      # 新規
│   │   ├── get-product.use-case.ts       # 新規
│   │   ├── update-product.use-case.ts    # 新規
│   │   ├── delete-product.use-case.ts    # 新規
│   │   ├── record-price.use-case.ts      # 新規
│   │   ├── get-cheapest-store.use-case.ts# 新規
│   │   ├── get-stores.use-case.ts        # 新規
│   │   └── index.ts                      # 新規: re-export
│   └── index.ts                          # 追記: export * from './product'
│
├── infrastructure/src/
│   ├── db/
│   │   └── schema.ts                     # 追記: stores / products / price_records テーブル
│   ├── repositories/
│   │   ├── drizzle-product.repository.ts # 新規: DrizzleProductRepository
│   │   └── drizzle-store.repository.ts   # 新規: DrizzleStoreRepository
│   └── index.ts                          # 追記: DrizzleProductRepository / DrizzleStoreRepository re-export
│
├── api-contract/src/
│   ├── product.schema.ts                 # 新規: Zod スキーマ
│   ├── store.schema.ts                   # 新規: Zod スキーマ
│   └── index.ts                          # 追記: export * from './product.schema' 等
│
apps/web/src/
├── server/
│   ├── routes/
│   │   ├── products.ts                   # 新規: Hono ルート（recipes.ts パターン踏襲）
│   │   └── stores.ts                     # 新規: Hono ルート
│   └── app.ts                            # 追記: productsRoute / storesRoute 登録・ProductNotFoundError / StoreNotFoundError の onError ハンドリング
└── app/
    └── products/                         # 新規ディレクトリ
        ├── page.tsx                      # 新規: 商品一覧（Server Component）
        ├── _components/
        │   ├── product-list-client.tsx   # 新規: 一覧 Client Component（検索フィルタ・RPC）
        │   └── product-card.tsx          # 新規: 商品カードコンポーネント
        ├── new/
        │   ├── page.tsx                  # 新規: 商品作成（Server Component ラッパー）
        │   └── _components/
        │       └── product-form-client.tsx  # 新規: 作成フォーム Client Component
        └── [id]/
            ├── page.tsx                  # 新規: 商品詳細（Server Component）
            ├── _components/
            │   ├── product-detail-client.tsx  # 新規: 詳細 + 価格記録フォーム Client Component
            │   └── price-history-chart.tsx    # 新規: 価格推移グラフ（shadcn/ui chart + Recharts）
            └── edit/
                ├── page.tsx              # 新規: 商品編集（Server Component）
                └── _components/
                    └── product-edit-form-client.tsx  # 新規: 編集フォーム Client Component
```

---

## 4. テスト方針

test-designer への橋渡しとして、優先度・対象・観点を整理する。詳細なテストケース設計・実装は test-designer の責務とする。

### 自動テスト対象（Domain 層・Application 層）

Domain 層は Vitest で co-located テスト（`src/**/*.test.ts`）が導入済み。新規ドメインオブジェクト・UseCase を追加するため、以下を追加・実施する。

| 対象                                    | テスト観点                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Money` 値オブジェクト                  | `Money.of` 非負チェック、`add`・`multiply`・`isLessThan` の正常動作                                                                                        |
| `ProductId` 値オブジェクト              | `generate()` が UUID 形式を返すこと、`fromString()` が往復で一致すること                                                                                   |
| `StoreId` 値オブジェクト                | ProductId と同様                                                                                                                                           |
| `Product` 集約                          | `create()` バリデーション（name 空白）、`recordPrice()` でヒストリ追加、`latestPriceAt()` 正常・空ケース、`cheapestStoreAt()` 単一店舗・複数店舗・記録なし |
| unitPrice 計算（`UnitPriceCalculator`） | 重量系 g/kg・容量系 ml/l・個数系・調理単位の全パターン、ゼロ除算防止（packageSizeValue > 0 の前提で確認）                                                  |
| `CreateProductUseCase`                  | name 空白エラー、正常作成で ProductDto 返却                                                                                                                |
| `RecordPriceUseCase`                    | priceAmount = 0 エラー、packageSizeValue = 0 エラー、Store 不存在エラー（U4 推奨案）、正常価格記録                                                         |
| `GetCheapestStoreUseCase`               | 価格記録なし → null、単一店舗、複数店舗の最安選択                                                                                                          |
| `UpdateProductUseCase`                  | 存在しない ID → ProductNotFoundError                                                                                                                       |
| `DeleteProductUseCase`                  | 存在しない ID → ProductNotFoundError（U3 推奨案）                                                                                                          |

### 手動テスト観点

- 商品一覧に作成した商品が表示されること
- 商品作成フォームでカテゴリ・単位のセレクト選択が機能すること
- aliases カンマ区切り入力が配列として保存・表示されること
- 価格記録フォームで単位種別に応じて unitPrice が正しく計算されること（重量/容量/個数の目視確認）
- 価格推移グラフが Store 別に色分けして表示されること
- 最安店舗が商品詳細に表示されること
- Store シード重複投入が冪等に完了すること（ON CONFLICT DO NOTHING）
- 存在しない商品 ID でアクセスすると 404 になること

### Application 層・Infrastructure 層テスト

要件書 §7 の試験観点（N1〜N18、E1〜E13、B1〜B8）を test-designer が整理する。Application / Infrastructure 層の自動テストは後続フェーズで整備する方針（coding-standards.md 準拠）。

---

## 5. unitPrice 計算ロジックの設計

### 配置: ドメインサービス `UnitPriceCalculator`（推奨）

`packages/domain/src/product/unit-price-calculator.ts` にドメインサービスとして配置する。

**理由:**

- unitPrice 計算は「単位の意味論に基づく正規化」というドメイン知識。単位の種別判定（g/kg は重量系など）および換算定数（1kg = 1000g）は純粋なドメインロジックであり、Application 層の手続きではない。
- `Product.recordPrice(record: PriceRecord)` の呼び出し前に Application 層（RecordPriceUseCase）が `UnitPriceCalculator.calculate(priceAmount, packageSize)` を呼んで `unitPrice` を得る。これにより UseCase は組み立て役に徹し、計算ロジックはドメインに閉じる。
- 将来 `isPriceLow` 等の計算に unitPrice の正規化を再利用する際もドメイン層に閉じているため呼び出しやすい。

Application 層の単純な関数（`calculateUnitPrice` ユーティリティ）として置く案もある。そちらは Domain 層を薄く保てるが、単位換算という業務ルールがドメイン外に漏れるため採用しない。

### 計算ロジックの構造

```
UnitPriceCalculator.calculate(priceAmount: number, packageSize: Quantity): Money

  単位種別判定:
    重量系: packageSize.unit が 'g' | 'kg'
      → gramValue = unit === 'kg' ? value * 1000 : value
      → unitPriceAmount = priceAmount / gramValue * 100  （100g あたり）

    容量系: packageSize.unit が 'ml' | 'l'
      → mlValue = unit === 'l' ? value * 1000 : value
      → unitPriceAmount = priceAmount / mlValue * 100    （100ml あたり）

    個数系・調理単位: それ以外の Unit すべて
      → unitPriceAmount = priceAmount / value             （1単位あたり）

  Money.of(roundedAmount, 'JPY') を返す
```

単位種別判定表と換算定数（`WEIGHT_UNITS`・`VOLUME_UNITS` のセット）は `unit-price-calculator.ts` 内に閉じる。Domain 層は Drizzle や HTTP に依存しないため、この配置はアーキテクチャ制約を満たす。

### 丸め方針（U1）

**推奨案: 小数点以下1桁で `Math.round`（DB 保存も同様）**

根拠:

- 「137円 / 300g × 100 = 45.666...」→ `Math.round(45.7)` = 46 では誤差が生じる
- 小数点以下1桁（45.7円/100g）で保存すると、`Math.round(value * 10) / 10` により精度を保ちつつ表示では整数に丸められる
- `Math.floor` より `Math.round` のほうが系統的なバイアスが小さく、価格比較での誤判定リスクが低い

DB のカラム型は `numeric(10, 1)`（後述）を推奨する。

**要ユーザー確認**: 丸め桁数・丸め方式の確定はユーザー承認が必要な設計判断。「小数点以下1桁 + Math.round」が受け入れられない場合、整数（円単位切り捨て）または小数点以下2桁などの代替案も可能。

---

## 6. PriceRecord の集約内 vs 別リポジトリの設計判断（U7）

### 案A: products テーブルの jsonb カラムに priceHistory を格納（Recipe ingredients と同パターン）

- 長所: 実装がシンプル。既存の `jsonb` パターン（`ingredients`・`steps`）と完全に一致するため、Repository の実装量が少ない。集約整合性の管理が単純（1テーブルへの upsert のみ）。
- 短所: price_records が増えると jsonb カラムが肥大化する。将来「店舗横断で全商品の価格記録を一覧」「特定期間のクエリ」などが必要になった場合、jsonb 内を走査する非効率なクエリになる。集計・フィルタリングが DB 側でできない。

### 案B: price_records 独立テーブル + DrizzleProductRepository が JOIN 復元（推奨）

- 長所: 将来の価格分析クエリ（集計・フィルタ・インデックス）に柔軟に対応できる。PriceRecord レコードが DB の第一級市民となり、複合インデックス設計が可能。ShoppingList 完了時の価格記録（CompleteShoppingUseCase）など、高頻度な書き込みシナリオにも適する。
- 短所: 実装量が増える（JOIN・N+1 対策の検討）。復元時に products LEFT JOIN price_records が必要。

**推奨: 案B（独立テーブル）**

MVP1 の2人利用でも case B の実装コストは限定的であり、price_records の設計が後から変えにくい（jsonb 内データのマイグレーションは困難）ことを考えると、最初から独立テーブルにすることが望ましい。`Product.priceHistory` のドメインモデルは維持したまま、Repository 実装が JOIN で復元する責務を持つ。

stores テーブルは案A/B いずれでも独立テーブルが必須（StoreRepository が存在するため）。

**要ユーザー確認**: jsonb vs 独立テーブルはスキーマ設計の確定判断であり、マイグレーション後の変更コストが高い。ユーザー承認を要する。

---

## 7. DB スキーマ詳細（案B 独立テーブルベース）

以下は推奨案の Drizzle 定義概要。実装コードは implementer が `packages/infrastructure/src/db/schema.ts` に追記する。

### stores テーブル

```
stores テーブル（pgTable）
  id          text PK
  name        text NOT NULL
  createdAt   timestamp NOT NULL DEFAULT NOW()
```

- `StoreId.value` が `text` 型の UUID 文字列（RecipeId と同パターン）。
- `updatedAt` は MVP1 では不要（Store は変更しない）。

### products テーブル

```
products テーブル（pgTable）
  id           text PK
  name         text NOT NULL
  aliases      text[] NOT NULL DEFAULT []
  category     text NOT NULL   -- ProductCategory の文字列値
  defaultUnit  text NOT NULL   -- Unit の文字列値
  createdAt    timestamp NOT NULL DEFAULT NOW()
  updatedAt    timestamp NOT NULL DEFAULT NOW()
```

- `priceHistory` は products テーブルに持たない（案B）。
- `aliases` は `text[]`（既存 `tags` カラムと同一型）。
- `category` / `defaultUnit` は text で格納し、Repository 復元時に型チェックを行う（drizzle-recipe.repository.ts の `toUnit` / `toRecipeTag` パターン踏襲）。

### price_records テーブル

```
price_records テーブル（pgTable）
  id               text PK
  productId        text NOT NULL REFERENCES products(id) ON DELETE CASCADE
  storeId          text NOT NULL REFERENCES stores(id)
  priceAmount      numeric(10, 1) NOT NULL   -- Money.amount（推奨: U1 小数点以下1桁）
  unitPriceAmount  numeric(10, 1) NOT NULL   -- 正規化後の unitPrice
  packageSizeValue numeric(10, 3) NOT NULL   -- Quantity.value
  packageSizeUnit  text NOT NULL             -- Unit の文字列値
  observedAt       timestamp NOT NULL
  createdAt        timestamp NOT NULL DEFAULT NOW()
```

**インデックス:**

- `(productId, observedAt DESC)` — `latestPriceAt()` / `cheapestStoreAt()` のクエリ最適化
- `(productId, storeId)` — 店舗別絞り込み

**Money カラム型の選択（U1 と連動）:**

| 丸め方針              | 推奨カラム型     | 理由                                |
| --------------------- | ---------------- | ----------------------------------- |
| 小数点以下1桁（推奨） | `numeric(10, 1)` | 精度保証・DB 側での正確な比較が可能 |
| 整数円単位            | `integer`        | シンプルだが精度が低い              |
| 小数点以下2桁         | `numeric(10, 2)` | 精度は高いが表示上の意味が薄い      |

`real`（IEEE 754 float）は DB 内での浮動小数点誤差が生じるため**非推奨**。

**price_records の PK について:**

- UUID 文字列（`text`）を使用。`PriceRecordId` を新規に定義する必要がある。代替として複合 PK `(productId, storeId, observedAt)` も可能だが、同日同店の複数記録（U5）を許容する設計では UUID PK が適切。
- **要ユーザー確認（U5）**: 同日・同店・同商品の重複記録を許可するかは PK 設計と直結する。UUID PK であれば重複は技術的に許可される。

### Store シード

```sql
-- 冪等シード（migration ファイルまたは seed スクリプト）
INSERT INTO stores (id, name, created_at)
VALUES
  ('<固定UUID-A>', 'コモディイイダ', NOW()),
  ('<固定UUID-B>', 'ライフ', NOW())
ON CONFLICT (id) DO NOTHING;
```

**U2 推奨案: 固定 UUID を使用する。**

理由: シード後に Recipe 集約の ingredient.productRef などが storeId を参照する可能性があり、再現性・移植性の観点から固定値が望ましい。テスト環境での衝突リスクは、テスト用 DB を本番と分離することで回避できる（既存の recipe テスト環境と同様）。

シード ID の具体値は implementer が決定してよい（設計書には記載不要）。

---

## 8. 未決事項への設計回答

要件書 U1〜U7 すべてに対する設計者推奨案と根拠。

| #   | 未決事項                             | 設計者推奨案                                                                                                            | 根拠                                                                                                                                                                                                        | ユーザー確認要否                                   |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| U1  | unitPrice の丸め桁数・方式           | **小数点以下1桁、Math.round**。DB カラムは `numeric(10, 1)`。`Math.round(value * 10) / 10` で計算後に `Money.of` に渡す | 円/100g 単位で1桁あれば価格比較の精度として十分。Math.round の方が Math.floor より系統バイアスが小さい                                                                                                      | **要ユーザー確認**                                 |
| U2  | Store シード ID の固定化可否         | **固定 UUID を採用**。実装者が適切な UUID を割り当てる                                                                  | 将来の ID 参照（ShoppingItem.targetStore など）の再現性確保。テスト環境衝突リスクは DB 分離で対応                                                                                                           | アーキテクチャ設計者判断で推奨。ユーザー確認は任意 |
| U3  | DeleteProductUseCase の存在チェック  | **`ProductNotFoundError` を throw**（冪等成功ではなく NotFound エラー）                                                 | Recipe パターン（GetRecipe は NotFound）との一貫性を優先。DELETE も存在チェックを行うことでバグ検出が早くなる                                                                                               | **要ユーザー確認**                                 |
| U4  | RecordPriceUseCase の Store 存在検証 | **UseCase 内で `StoreRepository.findById()` による検証**（Zod のみでは不十分）                                          | フロントで Store 選択肢を制限しても、API を直接呼ばれた場合に不正な storeId が通る。UseCase でも存在チェックし `StoreNotFoundError` を throw する。これは契約（バリデーション）ではなくビジネスルールの強制 | アーキテクチャ設計者判断で推奨                     |
| U5  | 価格記録の重複可否                   | **重複を許可**（同日・同店・同商品の複数登録を可とする）                                                                | 買い物中に価格を見直して再記録するユースケースが自然に存在する。「最新 = observedAt が最大のレコード」として扱い、表示は最新1件                                                                             | **要ユーザー確認**                                 |
| U6  | PriceRecordDto の storeName 解決     | **UseCase 内で `StoreRepository` を使って解決**（PriceRecordDto に storeName を含める）                                 | フロント側で別途 GetStoresUseCase を呼んでジョインする方法は、Store 数が増えた際に N+1 的な問題を引き起こす。UseCase が1回の操作で完結する方が設計として明快                                                | アーキテクチャ設計者判断で推奨                     |
| U7  | price_records テーブル設計           | **案B（独立テーブル）を推奨**（§6 参照）                                                                                | 将来の分析クエリ・集計への柔軟性、後からの変更困難性を考慮                                                                                                                                                  | **要ユーザー確認**                                 |

---

## 9. 契約面の概要

詳細な Zod スキーマ・DTO 型定義は contract-designer（または implementer）が `packages/api-contract/src/product.schema.ts` / `store.schema.ts` に実装する。

ここでは設計上の前提となる nullability・必須/任意の方針を示す。

### API エンドポイント

| メソッド | パス                               | UseCase                 | 説明         |
| -------- | ---------------------------------- | ----------------------- | ------------ |
| GET      | `/api/products`                    | GetProductsUseCase      | 商品一覧     |
| POST     | `/api/products`                    | CreateProductUseCase    | 商品作成     |
| GET      | `/api/products/:id`                | GetProductUseCase       | 商品詳細     |
| PUT      | `/api/products/:id`                | UpdateProductUseCase    | 商品更新     |
| DELETE   | `/api/products/:id`                | DeleteProductUseCase    | 商品削除     |
| POST     | `/api/products/:id/price-records`  | RecordPriceUseCase      | 価格記録     |
| GET      | `/api/products/:id/cheapest-store` | GetCheapestStoreUseCase | 最安店舗取得 |
| GET      | `/api/stores`                      | GetStoresUseCase        | 店舗一覧     |

### スキーマ前提方針

**createProductSchema / updateProductSchema の入力:**

- `name`: 非空文字列必須（`nonBlankString` パターン、recipe.schema.ts 踏襲）
- `aliases`: `string[]` 必須（空配列許容）。各要素は空白トリム後に空なら除去（Hono ルートまたは UseCase 入口で処理）
- `category`: `productCategorySchema`（`z.enum` で確定列挙のみ）必須
- `defaultUnit`: `unitSchema`（既存 `recipe.schema.ts` の `unitSchema` 流用）必須

**recordPriceSchema の入力:**

- `storeId`: 非空文字列必須（UUID 形式チェックは Hono ルート層で `z.uuid()`）
- `priceAmount`: `z.number().positive()`（0 超必須）
- `packageSizeValue`: `z.number().positive()`（0 超必須、ゼロ除算防止）
- `packageSizeUnit`: `unitSchema` 必須

**ProductDto / PriceRecordDto の出力:**

- `createdAt` / `updatedAt` / `observedAt`: ISO 8601 文字列（`.toISOString()` 変換、RecipeDto と同パターン）
- `priceHistory`: `PriceRecordDto[]`（空配列許容）
- `storeName`: `string`（U6 推奨案によりnon-null。UseCase 内で解決済み）

**GetCheapestStoreUseCase の出力:**

- レスポンス型: `{ storeId: string, storeName: string, latestPrice: number, unitPrice: number } | null`
- Hono ルートは `null` を `200 { data: null }` として返す（204 ではなく JSON 統一を推奨）

---

## 10. データフロー

### 商品一覧（初期表示）

```
ブラウザ → /products
  → apps/web/src/app/products/page.tsx (Server Component)
      → GetProductsUseCase.execute()     手動 DI
          → DrizzleProductRepository.findAll()
              → SELECT FROM products LEFT JOIN price_records
      → ProductDto[] を Client Component へ渡す
  → product-list-client.tsx (Client Component)
      → useState で initialData 設定
      → 検索フィルタ変更時: client.api.products.$get() で Hono RPC 再取得
```

### 価格記録（RecordPriceUseCase フロー）

```
ユーザーが価格記録フォーム送信
  → client.api.products[':id']['price-records'].$post({ json: body })
      → POST /api/products/:id/price-records
          → RecordPriceUseCase.execute({
              productId, storeId, priceAmount, packageSizeValue, packageSizeUnit
            })
              1. ProductRepository.findById(productId)  → 未存在: ProductNotFoundError
              2. StoreRepository.findById(storeId)      → 未存在: StoreNotFoundError（U4 推奨）
              3. UnitPriceCalculator.calculate(priceAmount, Quantity.of(packageSizeValue, packageSizeUnit))
                   → Money.of(roundedUnitPrice, 'JPY')
              4. PriceRecord 構築（storeId, price, unitPrice, packageSize, observedAt: new Date()）
              5. product.recordPrice(priceRecord)
              6. ProductRepository.save(product)
          → 200 void（または 201）
  → 成功: クライアントで TanStack Query invalidate → 詳細画面リロード
```

### 商品詳細（初期表示）

```
ブラウザ → /products/[id]
  → apps/web/src/app/products/[id]/page.tsx (Server Component)
      → GetProductUseCase.execute(id)           手動 DI
          → DrizzleProductRepository.findById  （price_records を JOIN して PriceRecord[] 復元）
      → GetCheapestStoreUseCase.execute(id)     手動 DI
          → ProductRepository.findById(id)
          → product.cheapestStoreAt(new Date()) → StoreId | null
          → StoreRepository.findById(cheapestStoreId)  → Store 名前解決
      → ProductDto・cheapestStore 結果を Client Component へ渡す
  → product-detail-client.tsx (Client Component)
      → 価格推移グラフ（price-history-chart.tsx）描画
      → 価格記録フォームのミューテーション: Hono RPC
```

---

## 11. エラー処理

| エラー種別                                 | 発生箇所                                                                 | HTTP ステータス         | 処理方法                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ProductNotFoundError                       | UseCase（GetProduct / Update / Delete / RecordPrice / GetCheapestStore） | 404                     | `app.ts` の `onError` で `ProductNotFoundError` → 404 JSON レスポンス                                                        |
| StoreNotFoundError                         | UseCase（RecordPriceUseCase、U4 推奨）                                   | 404                     | `app.ts` の `onError` で `StoreNotFoundError` → 404 JSON レスポンス                                                          |
| Zod バリデーションエラー                   | Hono ルート（`zValidator`）                                              | 400                     | `@hono/zod-validator` が自動で 400 Bad Request を返す（既存パターン）                                                        |
| ビジネスルール違反（name 空白等）          | UseCase 入口                                                             | 500（→ 400 に変更推奨） | 現状は `onError` で 500 になるが、将来 `ValidationError` クラスを導入して 400 にマップすることを推奨（本 Sprint スコープ外） |
| DB 接続エラー                              | Repository                                                               | 500                     | `onError` が `console.error` + 500 JSON を返す（既存パターン）                                                               |
| Server Component での ProductNotFoundError | Server Component（`page.tsx`）                                           | Next.js 404             | catch して `notFound()` を呼ぶ（RecipeEditPage パターン踏襲）                                                                |

---

## 12. ProductId 互換性（Recipe との境界）

現在 `packages/domain/src/recipe/recipe-ingredient.ts` に `interface ProductId { readonly value: string }` が暫定定義されている。

Sprint 2 で `packages/domain/src/product/product-id.ts` に正式な `ProductId` クラスを定義するが、`RecipeIngredient.productRef` の型は `{ value: string } | null` のまま維持する（Sprint 2 スコープ外）。

**互換性の保証方針:**

- 正式 `ProductId` クラスは `{ readonly value: string }` を実装するため、既存の `RecipeIngredient.productRef: ProductId | null` が参照しているローカルインターフェースとは**構造的に互換**（TypeScript の構造的部分型）。
- Sprint 2 では `recipe-ingredient.ts` の `interface ProductId` を削除せず、そのまま残す。
- 将来（Sprint 3 以降）`RecipeIngredient.productRef` の型を `import type { ProductId }` に切り替えるが、それはドメインモデル統一の文脈で別設計書を起こす。

---

## 13. ログと監視

対象外（MVP1 では監視基盤なし）。サーバー側エラーは `console.error` が `app.ts` の `onError` で既に実装されている。

---

## 14. セキュリティ

MVP1 は認証なし（ADR-003 準拠、既存の Recipe 機能と同一前提）。URL を知っていれば誰でも操作可能。Phase 2 で認証導入時に再検討する。

入力値は `createProductSchema` / `updateProductSchema` / `recordPriceSchema`（Zod）によりサーバー側でバリデーションされる。クライアント側バリデーションは UX のための補助であり、サーバー側バリデーションが正とする。

---

## 15. 性能

MVP1 対象の2名利用・週1回の買い物では、Product 数100件・PriceRecord 数百件規模となり性能問題は生じない（`docs/04-domain-model.md` §設計ポイントに記載済み）。

`price_records` テーブルには `(productId, observedAt DESC)` の複合インデックスを付与することで、`cheapestStoreAt()` の復元クエリ（productId 絞り込み + 最新順ソート）に対応する。

---

## 16. 後方互換性

- 既存の `recipes` テーブル・Recipe 集約・Hono ルート（`/api/recipes`）への変更は一切行わない。
- `app.ts` への `ProductNotFoundError` / `StoreNotFoundError` の追加は既存の `RecipeNotFoundError` ハンドリングに影響しない（条件分岐の追加のみ）。
- `packages/application/src/index.ts` / `packages/infrastructure/src/index.ts` / `packages/api-contract/src/index.ts` への re-export 追加は後方互換。

---

## 17. 移行とリリース

- DB マイグレーション: `stores` / `products` / `price_records` テーブルの追加。既存 `recipes` テーブルへの変更なし。
- Store シード: マイグレーションスクリプトまたは seed スクリプトで `ON CONFLICT DO NOTHING` により冪等投入。
- デプロイ: マイグレーション実行後に Next.js デプロイ（Vercel）。マイグレーション忘れは `getDb()` が接続エラーを返すだけで既存機能に影響しない（products テーブルのみが存在しない状態）。

---

## 18. 未決事項（要ユーザー確認のまとめ）

実装着手前にユーザー確認が必要な設計判断。

| 優先度 | 項目                                      | 推奨案                                               | 確認が必要な理由                                                     |
| ------ | ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| 高     | **U1: unitPrice 丸め方針**                | 小数点以下1桁 + Math.round + `numeric(10, 1)` カラム | DB スキーマ確定に直結。後から変更困難                                |
| 高     | **U7: price_records テーブル設計**        | 独立テーブル（案B）                                  | スキーマ設計の根幹。jsonb との切り替えはマイグレーションコストが高い |
| 中     | **U3: DeleteProductUseCase 存在チェック** | ProductNotFoundError を throw                        | ユーザー体験・API 契約に影響                                         |
| 中     | **U5: 価格記録の重複可否**                | 重複許可（最新 = 最大 observedAt）                   | PK 設計と DB 制約に影響                                              |
