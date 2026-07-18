# 契約設計メモ: product-master

本体設計書 `docs/designs/product-master.md` の §9 契約面概要を詳細化したもの。

- ステータス: draft
- 作成日: 2026-06-26
- 対応スプリント: Sprint 2
- 参照: `docs/designs/product-master.md` / `docs/requirements/product-master.md`

---

## 目次

1. [設計前提と既存契約との整合](#1-設計前提と既存契約との整合)
2. [Zod スキーマ定義案](#2-zod-スキーマ定義案)
3. [API エンドポイント契約一覧](#3-api-エンドポイント契約一覧)
4. [DTO 定義案](#4-dto-定義案)
5. [エラー契約](#5-エラー契約)
6. [後方互換性・冪等性](#6-後方互換性冪等性)
7. [契約テスト方針（test-designer への橋渡し）](#7-契約テスト方針test-designer-への橋渡し)
8. [ユーザー確認が必要な未決事項](#8-ユーザー確認が必要な未決事項)

---

## 1. 設計前提と既存契約との整合

### 踏襲パターン

| 既存パターン                                          | 踏襲先                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `nonBlankString`（モジュールローカル、export しない） | `product.schema.ts` でも同名で再定義する。`recipe.schema.ts` から import しない（パッケージ内クロス依存を避けるため） |
| `unitSchema`（`recipe.schema.ts` で export 済み）     | `product.schema.ts` から `import { unitSchema } from './recipe.schema'` で流用する。**再定義しない（DRY 優先）**      |
| `z.uuid()` による param バリデーション                | `idParamSchema` を `products.ts` / `stores.ts` でも使用                                                               |
| `c.json(dto, 201)` / `c.body(null, 204)`              | POST 系は 201、DELETE は 204（後述の確認事項あり）                                                                    |
| `onError` での `{ error: string }` 形式               | 全エラーレスポンスに踏襲                                                                                              |
| DTO の `createdAt` / `updatedAt` は ISO 文字列        | `.toISOString()` 変換、`RecipeDto` と同パターン                                                                       |

### unitSchema の流用方針（DRY 観点）

`recipe.schema.ts` の `unitSchema` は `packages/domain/src/shared/unit.ts` の `Unit` 型と
1対1対応しており、`packages/api-contract/src/index.ts` で既に public API として export されている。

`product.schema.ts` では以下のようにこれを import する:

```typescript
import { unitSchema } from './recipe.schema';
```

これにより Unit 列挙値の二重管理を防ぐ。`store.schema.ts` も同様に `unitSchema` を
使う場合は `recipe.schema.ts` からの import とする。

---

## 2. Zod スキーマ定義案

ファイル配置: `packages/api-contract/src/product.schema.ts` / `packages/api-contract/src/store.schema.ts`

### 2-1. product.schema.ts

```typescript
import { z } from 'zod';
import { unitSchema } from './recipe.schema';

// モジュールローカル（export しない）。recipe.schema.ts と同名で各ファイルに定義する。
const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

// ProductCategory（確定列挙: 7値）
export const productCategorySchema = z.enum([
  '野菜',
  '肉',
  '魚',
  '調味料',
  '乾物',
  '冷凍',
  'その他',
]);

// 商品作成リクエストボディ
// id は param 由来のため body に含めない（recipes.ts の updateRecipeSchema と同方針）
export const createProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

// 商品更新リクエストボディ
// id は param 由来のため body に含めない
export const updateProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

// 価格記録リクエストボディ
// productId は URL param 由来のため含めない
// storeId は z.uuid() で形式チェック（Hono ルート層で検証済み param とは別に body 内 storeId も UUID チェックする）
export const recordPriceSchema = z.object({
  storeId: z.string().uuid(),
  priceAmount: z.number().positive(),
  packageSizeValue: z.number().positive(),
  packageSizeUnit: unitSchema,
});

// 型エクスポート
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type RecordPriceBody = z.infer<typeof recordPriceSchema>;
```

### 2-2. store.schema.ts

```typescript
import { z } from 'zod';

// 店舗レスポンス形状（出力用スキーマ）
// MVP1 は読み取り専用（動的追加なし）のため入力スキーマは不要
export const storeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

// 型エクスポート
export type StoreSchemaType = z.infer<typeof storeSchema>;
```

### 2-3. aliases の空文字除去：責務の配置方針

**方針: UseCase 入口で処理する（Zod transform は使わない）**

理由:

- `aliases` の空文字除去は「フォーム入力の正規化」であり、ドメインルールではなくアプリケーションの
  入力処理責務に属する。
- Zod の `transform` でスキーマ自体を変換すると、`z.infer<typeof createProductSchema>` の型が
  変換後の型になり、スキーマ定義と型の乖離が生じる（`z.string()` が `string` のままに
  見えてしまう）。型を単純に保つことで Hono RPC の型推論が壊れない。
- `createRecipeSchema` も `transform` を使っておらず（`superRefine` はバリデーションのみ）、
  既存パターンとの一貫性を保つ。
- UseCase の `execute()` 入口に `aliases.map(a => a.trim()).filter(a => a !== '')` を置くことで、
  UseCase テストでも空文字除去が確認できる。

`createProductSchema` / `updateProductSchema` の `aliases` フィールドは
`z.array(z.string())` のままとし、変換はしない。

---

## 3. API エンドポイント契約一覧

### 3-1. 全エンドポイント

| #   | メソッド | パス                               | UseCase                 | 成功ステータス       | リクエスト param | リクエスト body     | レスポンス body                                      |
| --- | -------- | ---------------------------------- | ----------------------- | -------------------- | ---------------- | ------------------- | ---------------------------------------------------- |
| 1   | GET      | `/api/products`                    | GetProductsUseCase      | 200                  | なし             | なし                | `ProductDto[]`                                       |
| 2   | POST     | `/api/products`                    | CreateProductUseCase    | 201                  | なし             | `CreateProductBody` | `ProductDto`                                         |
| 3   | GET      | `/api/products/:id`                | GetProductUseCase       | 200                  | `id: uuid`       | なし                | `ProductDto`                                         |
| 4   | PUT      | `/api/products/:id`                | UpdateProductUseCase    | 200                  | `id: uuid`       | `UpdateProductBody` | `ProductDto`                                         |
| 5   | DELETE   | `/api/products/:id`                | DeleteProductUseCase    | 204                  | `id: uuid`       | なし                | なし（空ボディ）                                     |
| 6   | POST     | `/api/products/:id/price-records`  | RecordPriceUseCase      | **200**（確定: 案A） | `id: uuid`       | `RecordPriceBody`   | なし（空ボディ）                                     |
| 7   | GET      | `/api/products/:id/cheapest-store` | GetCheapestStoreUseCase | 200                  | `id: uuid`       | なし                | `{ data: CheapestStoreResult \| null }`（確定: 案A） |
| 8   | GET      | `/api/stores`                      | GetStoresUseCase        | 200                  | なし             | なし                | `StoreDto[]`                                         |

### 3-2. エンドポイント別の詳細

#### GET /api/products（商品一覧）

```
成功レスポンス 200:
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "玉ねぎ",
    "aliases": ["タマネギ", "オニオン"],
    "category": "野菜",
    "defaultUnit": "個",
    "priceHistory": [
      {
        "storeId": "550e8400-e29b-41d4-a716-446655440010",
        "storeName": "コモディイイダ",
        "priceAmount": 98,
        "unitPriceAmount": 98,
        "packageSizeValue": 1,
        "packageSizeUnit": "個",
        "observedAt": "2026-06-20T10:00:00.000Z"
      }
    ],
    "createdAt": "2026-06-20T10:00:00.000Z",
    "updatedAt": "2026-06-20T10:00:00.000Z"
  }
]
```

#### POST /api/products（商品作成）

```
リクエストボディ:
{
  "name": "玉ねぎ",
  "aliases": ["タマネギ", "オニオン"],
  "category": "野菜",
  "defaultUnit": "個"
}

成功レスポンス 201:
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "玉ねぎ",
  "aliases": ["タマネギ", "オニオン"],
  "category": "野菜",
  "defaultUnit": "個",
  "priceHistory": [],
  "createdAt": "2026-06-26T10:00:00.000Z",
  "updatedAt": "2026-06-26T10:00:00.000Z"
}

エラーレスポンス 400（Zod バリデーション失敗）:
{ "error": "Bad Request", ... }  // @hono/zod-validator の標準エラー形式
```

#### GET /api/products/:id（商品詳細）

```
成功レスポンス 200: ProductDto（上記と同形）
エラーレスポンス 404: { "error": "Product not found: <id>" }
```

#### PUT /api/products/:id（商品更新）

```
リクエストボディ: UpdateProductBody（createProductSchema と同形）
成功レスポンス 200: ProductDto（更新後）
エラーレスポンス 404: { "error": "Product not found: <id>" }
エラーレスポンス 400: Zod バリデーション失敗
```

#### DELETE /api/products/:id（商品削除）

```
成功レスポンス 204: 空ボディ
エラーレスポンス 404: { "error": "Product not found: <id>" }（design §8 U3 推奨案）
```

#### POST /api/products/:id/price-records（価格記録）

```
リクエストボディ:
{
  "storeId": "550e8400-e29b-41d4-a716-446655440010",
  "priceAmount": 137,
  "packageSizeValue": 300,
  "packageSizeUnit": "g"
}

成功レスポンス: 200 空ボディ（要確認 — 後述）
エラーレスポンス 400: priceAmount <= 0 / packageSizeValue <= 0 / 不正 storeId UUID形式
エラーレスポンス 404（ProductNotFoundError）: { "error": "Product not found: <id>" }
エラーレスポンス 404（StoreNotFoundError）: { "error": "Store not found: <storeId>" }
```

**RecordPrice の成功ステータス（確定: 案A / 200）:**

| 案          | ステータス | レスポンスボディ                     | 根拠                                                                                                                                                                            |
| ----------- | ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 案A（推奨） | 200        | 空ボディ（`c.body(null, 200)` 相当） | `void` を返す UseCase であり、新規リソース URL が生成されないため 201 の意味論に合わない。`204 No Content` は成功かつ空ボディの標準的表現だが、DELETE と区別するため 200 を選択 |
| 案B         | 201        | 空ボディ                             | 新規 PriceRecord が作成されるという観点で 201 とする案（recipes.ts の POST パターン踏襲）                                                                                       |
| 案C         | 204        | 空ボディ                             | DELETE との対称性は下がるが、RFC 的には最も正確（空レスポンス成功）                                                                                                             |

設計推奨は **案A（200）**。理由: RecordPriceUseCase は PriceRecord を作成するが、その URL を
クライアントに知らせる必要がない（`Location` ヘッダーなし）。`void` の操作は 200 または
204 のどちらかが適切。同ルート内の POST で 201 を使うと「ProductDto が返ってくる」という
誤解を招く可能性がある。201 派の意見もあったが、**案A（200）で確定**（実装済み）。

#### GET /api/products/:id/cheapest-store（最安店舗取得）

```
価格記録あり成功レスポンス 200:
{
  "data": {
    "storeId": "550e8400-e29b-41d4-a716-446655440010",
    "storeName": "コモディイイダ",
    "latestPrice": 137,
    "unitPrice": 45.7
  }
}

価格記録なし成功レスポンス 200:
{ "data": null }

エラーレスポンス 404: { "error": "Product not found: <id>" }
```

**null 表現の方針（確定推奨: 200 + `{ "data": null }`）:**

`null` の返却に `204 No Content` を使わない理由:

- `204` はリソース操作が成功し返すべきコンテンツがないことを示す。
  「最安店舗が存在しない」は正常なビジネス状態であり、空コンテンツとは意味が異なる。
- クライアント（TanStack Query）が `null` と「エラー」を型安全に区別できる。
  `204` だとレスポンスボディが空のため `data as null` などの型アサーションが必要になる。
- `recipes.ts` / `app.ts` は空レスポンスを `204` に統一（DELETE のみ）しており、
  GET が `204` を返すパターンはこのコードベースに存在しない。

ラッパー形式 `{ "data": null }` を採用する理由:

- 価格記録ありの場合はフラットなオブジェクトが直接返り、価格記録なしは `{ "data": null }` と
  なると応答形状が非対称になる問題を避けるため、統一的なラッパー形式が望ましい。
- ただし、既存の recipes.ts は `c.json(recipe)` / `c.json(recipes)` とフラットに返しており、
  ラッパーを使っていない。cheapest-store のみラッパーを入れると乖離が生じる。

**確定: 案A**（実装済み）。当初検討した2案:

| 案          | null のレスポンス      | 非null のレスポンス                                          | 一貫性                                                          |
| ----------- | ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 案A（推奨） | `{ "data": null }`     | `{ "data": { storeId, storeName, latestPrice, unitPrice } }` | ラッパーで統一（cheapest-store のみ独自形式）                   |
| 案B         | `null`（JSON の null） | `{ storeId, storeName, latestPrice, unitPrice }`             | フラット（recipes と同形式、null レスポンスが `null` リテラル） |

Hono の `c.json(null)` は `null` を JSON としてシリアライズするため技術的には可能。
TanStack Query では `data === null` として扱える。設計推奨は**案A**（ラッパーで非対称を避ける）で、
**案Aで確定**（実装済み）。

#### GET /api/stores（店舗一覧）

```
成功レスポンス 200:
[
  { "id": "550e8400-e29b-41d4-a716-446655440010", "name": "コモディイイダ" },
  { "id": "550e8400-e29b-41d4-a716-446655440011", "name": "ライフ" }
]
```

### 3-3. レスポンスの包み方（ラッパー方針）

`GET /api/products/:id/cheapest-store` を除く全エンドポイントは `recipes.ts` と同様に
素の JSON 配列/オブジェクトをそのまま返す（`{ data: ... }` ラッパーなし）。
cheapest-store のみ null 表現の問題で別途確認が必要（上記参照）。

---

## 4. DTO 定義案

ファイル配置: `packages/application/src/product/product.dto.ts`

`recipe.dto.ts` の `interface` 書式に従う。Domain 型への依存は `import type` で行う。

```typescript
import type { ProductCategory } from '@cookpit/api-contract';
import type { Unit } from '@cookpit/domain/src/shared/unit';

// 出力 DTO ————————————————————————————————————————

export interface PriceRecordDto {
  storeId: string; // StoreId.value（UUID 文字列）
  storeName: string; // UseCase 内で StoreRepository により解決済み（非null）
  priceAmount: number; // Money.amount（小数点以下1桁、推奨案 U1）
  unitPriceAmount: number; // 正規化済み unitPrice（同上）
  packageSizeValue: number; // Quantity.value
  packageSizeUnit: Unit; // Quantity.unit
  observedAt: string; // ISO 8601（.toISOString()）
}

export interface ProductDto {
  id: string; // ProductId.value（UUID 文字列）
  name: string;
  aliases: string[]; // 空配列許容
  category: ProductCategory;
  defaultUnit: Unit;
  priceHistory: PriceRecordDto[]; // 空配列許容（価格記録なし）
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface StoreDto {
  id: string; // StoreId.value（UUID 文字列）
  name: string;
}

// 最安店舗取得結果（GetCheapestStoreUseCase の戻り値型）
// UseCase が null を返す場合は Hono ルートで { data: null } に変換する
export interface CheapestStoreResultDto {
  storeId: string;
  storeName: string;
  latestPrice: number; // その店舗の最新 priceAmount（Money.amount）
  unitPrice: number; // その店舗の最新 unitPriceAmount
}

// 入力 DTO ————————————————————————————————————————
// recipes.ts パターン: body の valid() 結果を直接 UseCase に渡すが、
// UseCase 引数型として InputDto を定義することで層間の型契約を明確にする。

export interface CreateProductInputDto {
  name: string;
  aliases: string[]; // UseCase 入口でトリム・空文字除去後の配列
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface UpdateProductInputDto {
  id: string; // URL param 由来
  name: string;
  aliases: string[];
  category: ProductCategory;
  defaultUnit: Unit;
}

export interface RecordPriceInputDto {
  productId: string; // URL param 由来
  storeId: string;
  priceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
}
```

### DTO Nullability まとめ

| フィールド                       | 型                 | null 許容                                            | 備考                                              |
| -------------------------------- | ------------------ | ---------------------------------------------------- | ------------------------------------------------- |
| `ProductDto.priceHistory`        | `PriceRecordDto[]` | 不可（空配列）                                       | 価格記録なし = `[]`                               |
| `PriceRecordDto.storeName`       | `string`           | 不可                                                 | UseCase 内で解決済み（U6 確定）                   |
| `PriceRecordDto.priceAmount`     | `number`           | 不可                                                 | Money.amount >= 0 保証                            |
| `PriceRecordDto.unitPriceAmount` | `number`           | 不可                                                 | 同上                                              |
| `CheapestStoreResultDto`         | object             | 不可（UseCase から null が来る場合は Hono 層で変換） | UseCase 戻り値は `CheapestStoreResultDto \| null` |
| `ProductDto.aliases`             | `string[]`         | 不可（空配列）                                       | 空の場合 `[]`                                     |

「値なし」の表現はコーディング規約に従い `null` に統一。`undefined` は使用しない。

---

## 5. エラー契約

### 5-1. エラー形式

全エラーレスポンスは `{ "error": string }` 形式（既存 `app.ts` の `onError` と同形）。

```json
{ "error": "Product not found: 550e8400-e29b-41d4-a716-446655440001" }
{ "error": "Store not found: 550e8400-e29b-41d4-a716-446655440010" }
{ "error": "Internal Server Error" }
```

### 5-2. エラークラスと HTTP ステータスのマッピング

| エラークラス                      | 発生 UseCase                                                  | HTTP                  | onError マッピング                                                                              | エラーメッセージパターン               |
| --------------------------------- | ------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| `ProductNotFoundError`            | GetProduct / Update / Delete / RecordPrice / GetCheapestStore | 404                   | `app.ts` の `onError` に追加                                                                    | `"Product not found: <id>"`            |
| `StoreNotFoundError`              | RecordPrice（U4 推奨: UseCase 内で Store 存在検証）           | 404                   | `app.ts` の `onError` に追加                                                                    | `"Store not found: <storeId>"`         |
| Zod バリデーションエラー          | 全 Hono ルート（`zValidator`）                                | 400                   | `@hono/zod-validator` が自動処理                                                                | `@hono/zod-validator` の標準メッセージ |
| ドメインルール違反（name 空白等） | CreateProduct / UpdateProduct                                 | 500（現状）→ 将来 400 | `onError` で 500 として処理（Sprint 2 スコープ外で ValidationError 導入予定 — design §11 参照） | `"Internal Server Error"`              |
| DB 接続エラー・予期しない例外     | 全                                                            | 500                   | `onError` の `console.error` + 500                                                              | `"Internal Server Error"`              |

### 5-3. ErrorClass 定義案

```typescript
// packages/application/src/product/product-not-found.error.ts
export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}

// packages/application/src/product/store-not-found.error.ts
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = 'StoreNotFoundError';
  }
}
```

既存の `RecipeNotFoundError` と完全に同じ命名・構造パターン。

### 5-4. app.ts の onError 拡張方針

```typescript
// 現行
if (err instanceof RecipeNotFoundError) {
  return c.json({ error: err.message }, 404);
}

// 拡張後（追加のみ。既存行に変更なし）
if (err instanceof RecipeNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof ProductNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof StoreNotFoundError) {
  return c.json({ error: err.message }, 404);
}
```

### 5-5. Server Component での ProductNotFoundError 処理

`apps/web/src/app/products/[id]/page.tsx` など Server Component からの UseCase 直接呼び出しでは:

```typescript
try {
  const product = await usecase.execute(id);
  // ...
} catch (err) {
  if (err instanceof ProductNotFoundError) {
    notFound(); // Next.js の notFound() を呼ぶ（RecipeEditPage パターン踏襲）
  }
  throw err;
}
```

---

## 6. 後方互換性・冪等性

### 6-1. 既存 recipe 契約への影響

- `/api/recipes` ルート・Hono 型・`RecipeDto` / `CreateRecipeBody` 等の既存契約は**変更しない**。
- `packages/api-contract/src/index.ts` への `export * from './product.schema'` / `export * from './store.schema'` 追記は**追加のみ**であり後方互換。
- `app.ts` の `onError` への `ProductNotFoundError` / `StoreNotFoundError` 追加は**条件分岐の追加のみ**。既存 `RecipeNotFoundError` の分岐には変更を加えない。
- `packages/application/src/index.ts` / `packages/infrastructure/src/index.ts` への re-export 追加も後方互換。

### 6-2. 冪等性の整理

| エンドポイント                       | 冪等性              | 備考                                                                               |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| GET /api/products                    | 冪等                | 副作用なし                                                                         |
| GET /api/products/:id                | 冪等                | 副作用なし                                                                         |
| GET /api/products/:id/cheapest-store | 冪等                | 副作用なし                                                                         |
| GET /api/stores                      | 冪等                | 副作用なし                                                                         |
| PUT /api/products/:id                | 冪等                | 同じボディで複数回呼んでも同じ結果                                                 |
| DELETE /api/products/:id             | 非冪等（U3 推奨案） | 2回目は ProductNotFoundError → 404                                                 |
| POST /api/products                   | 非冪等              | 毎回新規 Product が作成される                                                      |
| POST /api/products/:id/price-records | **非冪等**          | U5 推奨案（重複許可）により同一ボディで複数回呼ぶと同数の PriceRecord が作成される |

**RecordPrice の非冪等性について:**
冪等性キーの導入（リクエストに `idempotencyKey` を付与して重複排除する）は MVP1 スコープ外。
UI 側でフォーム送信後にボタンを disabled にするなどの UX 対策で多重送信を防ぐ方針とする。

### 6-3. Store シードの冪等性

`INSERT INTO stores ... ON CONFLICT (id) DO NOTHING` による冪等シード。
同じ固定 UUID を再投入してもエラーにならない（design §7 参照）。

---

## 7. 契約テスト方針（test-designer への橋渡し）

以下はテスト設計の観点まとめ。テストケースの詳細設計・実装は test-designer の責務。

### 7-1. Zod スキーマの境界テスト観点

#### createProductSchema

| 観点                           | テスト値                  | 期待結果                                    |
| ------------------------------ | ------------------------- | ------------------------------------------- |
| name 必須                      | `name: ""`                | バリデーション失敗（required）              |
| name 空白のみ                  | `name: "  "`              | バリデーション失敗（trim 後空文字）         |
| name 正常                      | `name: "玉ねぎ"`          | 成功                                        |
| category 列挙外                | `category: "果物"`        | バリデーション失敗                          |
| category 全7値                 | 各 enum 値                | 成功                                        |
| defaultUnit 列挙外             | `defaultUnit: "oz"`       | バリデーション失敗                          |
| defaultUnit 全17値             | 各 enum 値                | 成功                                        |
| aliases 空配列                 | `aliases: []`             | 成功                                        |
| aliases 空文字含む             | `aliases: ["", "玉ねぎ"]` | Zod 層では成功（空文字除去は UseCase 責務） |
| aliases なし（フィールド欠損） | `aliases` フィールドなし  | バリデーション失敗（required）              |

#### recordPriceSchema

| 観点                   | テスト値                  | 期待結果                                  |
| ---------------------- | ------------------------- | ----------------------------------------- |
| priceAmount = 0        | `priceAmount: 0`          | バリデーション失敗（positive 制約）       |
| priceAmount < 0        | `priceAmount: -1`         | バリデーション失敗                        |
| priceAmount 最小正数   | `priceAmount: 0.01`       | 成功                                      |
| packageSizeValue = 0   | `packageSizeValue: 0`     | バリデーション失敗（positive 制約）       |
| packageSizeValue < 0   | `packageSizeValue: -1`    | バリデーション失敗                        |
| storeId が UUID 形式外 | `storeId: "not-a-uuid"`   | バリデーション失敗                        |
| storeId が UUID 形式   | `storeId: "550e8400-..."` | Zod 層では成功（存在確認は UseCase 責務） |
| packageSizeUnit 列挙外 | `packageSizeUnit: "oz"`   | バリデーション失敗                        |

### 7-2. API 契約（Hono ルート）の検証観点

| 観点                                 | 確認内容                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| param UUID チェック                  | `GET /api/products/not-a-uuid` → 400（`zValidator('param', idParamSchema)` で弾かれる）  |
| ProductNotFoundError → 404           | 存在しない UUID で `GET /api/products/:id` → `{ error: "Product not found: ..." }` + 404 |
| StoreNotFoundError → 404             | 存在しない storeId で `POST /api/products/:id/price-records` → 404                       |
| createProductSchema バリデーション   | name 空文字 POST → 400                                                                   |
| recordPriceSchema バリデーション     | priceAmount = 0 POST → 400                                                               |
| 201 ステータス（POST /api/products） | 成功時に 201 が返ること                                                                  |
| 204 ステータス（DELETE）             | 成功時に 204 + 空ボディが返ること                                                        |
| cheapest-store null 表現             | 価格記録なしの Product ID で `GET /api/products/:id/cheapest-store` → 200 + null 相当    |

### 7-3. DTO 往復テスト観点（型の整合性確認）

| 観点                          | 確認内容                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| ProductDto の型一致           | Repository → Entity → Mapper → ProductDto の全フィールド型が一致すること          |
| PriceRecordDto.storeName 解決 | UseCase が StoreRepository から storeName を解決し、PriceRecordDto に含まれること |
| priceHistory 空配列           | 価格記録なし Product の ProductDto.priceHistory が `[]` であること                |
| ISO 文字列変換                | createdAt / updatedAt / observedAt が ISO 8601 文字列として返ること               |
| aliases 空文字除去            | UseCase 入口で `["", " 玉ねぎ ", "  "]` → `["玉ねぎ"]` に正規化されること         |

### 7-4. 後方互換検証観点

| 観点                            | 確認内容                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| recipe 契約への無影響           | `GET /api/recipes` が引き続き正常動作すること                      |
| api-contract の既存エクスポート | `unitSchema` / `createRecipeSchema` 等が変わらず import できること |
| onError の既存動作              | `RecipeNotFoundError` が引き続き 404 にマップされること            |

---

## 8. ユーザー確認が必要な未決事項

本契約設計で新たに整理した、または design doc から引き継いだ、**ユーザー確認が必要な項目**。

### C1. RecordPrice の成功ステータスコード（最優先確認）

**確認内容**: `POST /api/products/:id/price-records` 成功時のステータスを何にするか。

| 案  | ステータス          | 推奨度                                       |
| --- | ------------------- | -------------------------------------------- |
| 案A | **200**（空ボディ） | 推奨（新規 URL 非発行の副作用操作）          |
| 案B | 201（空ボディ）     | recipes.ts の POST との統一性                |
| 案C | 204（空ボディ）     | RFC 的に最も正確だが DELETE との区別が消える |

設計推奨: **案A（200）**。

### C2. cheapest-store の null 表現（最優先確認）

**確認内容**: 価格記録なしの場合の `GET /api/products/:id/cheapest-store` レスポンス形式。

| 案  | 200 の body             | 非null の body                            |
| --- | ----------------------- | ----------------------------------------- |
| 案A | `{ "data": null }`      | `{ "data": { storeId, storeName, ... } }` |
| 案B | `null`（JSON リテラル） | `{ storeId, storeName, ... }`             |

設計推奨: **案A（ラッパー統一）**。ただし既存 recipes.ts のフラット形式との乖離が生じることに留意。

### C3. U1: unitPrice の丸め方針（design §18 より引き継ぎ）

**確認内容**: 丸め桁数と方式の確定（DB スキーマ `numeric(10, 1)` 確定に必要）。

設計推奨: **小数点以下1桁 + Math.round + `numeric(10, 1)` カラム**。

### C4. U3: DeleteProductUseCase の存在チェック（design §18 より引き継ぎ）

**確認内容**: 存在しない ID での DELETE が 404 か 204（冪等）か。

設計推奨: **ProductNotFoundError → 404**（Recipe パターン踏襲）。

### C5. U5: 価格記録の重複可否（design §18 より引き継ぎ）

**確認内容**: 同日・同店・同商品の複数 PriceRecord を許可するか。

設計推奨: **重複許可**（最新 = 最大 observedAt として扱う）。UUID PK により技術的に重複可能。

### C6. U7: price_records テーブル設計（design §18 より引き継ぎ）

**確認内容**: 独立テーブル（案B）か products テーブルの JSONB カラム（案A）か。

設計推奨: **独立テーブル（案B）**（将来の分析クエリ・集計への柔軟性を優先）。

---

## 附録: api-contract/src/index.ts 拡張案

```typescript
// packages/api-contract/src/index.ts（追記後）
export * from './recipe.schema';
export * from './product.schema';
export * from './store.schema';
```

これにより `@cookpit/api-contract` から `productCategorySchema` / `createProductSchema` /
`updateProductSchema` / `recordPriceSchema` / `storeSchema` および各 `z.infer` 型が
利用可能になる。既存の `unitSchema` は `recipe.schema.ts` 経由で引き続き export される。
