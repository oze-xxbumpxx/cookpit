# 契約設計: price-record-edit-and-store-rename

> §背景・目的・ドメイン設計・Application 設計・フロントエンド設計は
> `docs/designs/price-record-edit-and-store-rename.md` を参照。本書はその §API 設計
> 「なぜ ProductDto を返すか」「最終形は contract-designer」を受けて、Zod スキーマ・Hono
> エンドポイント・エラー契約・冪等性を実装可能な水準まで確定する。本体設計書と矛盾する記述は
> 無効（矛盾に気づいた場合は Orchestrator へ差し戻す）。

- ステータス: **draft**（U-1 はここで確定するが、要件定義書 U-2 相当のユーザー確認事項は無し。
  本書の決定自体はユーザー確認不要な契約実装詳細のみ）
- 対象: `packages/api-contract/src/product.schema.ts` / `store.schema.ts`（Zod）、
  Hono RPC（`apps/web/src/server/routes/products.ts` 追記・`stores.ts` 追記）
- 参照した既存契約: `product.schema.ts` / `store.schema.ts` / `shared.schema.ts` / `index.ts` /
  `app.ts` / `routes/products.ts` / `routes/stores.ts` / `product.dto.ts` / `product.mapper.ts` /
  `store.dto.ts` / `store.mapper.ts` / `shared/errors.ts` / 各エラークラス
- プロダクションコードは変更しない（実装は implementer）。DB スキーマ変更なし（設計書 §DB 設計）。

---

## 目次

1. [Zod スキーマ契約](#1-zod-スキーマ契約)
2. [スキーマ共有可否の判断（決定）](#2-スキーマ共有可否の判断決定)
3. [Hono RPC エンドポイント契約](#3-hono-rpc-エンドポイント契約)
4. [U-1 最終確定: レスポンスボディ](#4-u-1-最終確定-レスポンスボディ)
5. [エラー契約](#5-エラー契約)
6. [冪等性](#6-冪等性)
7. [サンプルペイロード](#7-サンプルペイロード)
8. [後方互換性判定](#8-後方互換性判定)
9. [契約テスト方針（test-designer への橋渡し）](#9-契約テスト方針test-designer-への橋渡し)
10. [実装ファイル一覧（参考・実装は implementer）](#10-実装ファイル一覧参考実装は-implementer)
11. [未決事項・申し送り](#11-未決事項申し送り)

---

## 1. Zod スキーマ契約

### 1.1 `packages/api-contract/src/product.schema.ts` 追加分

既存 `recordPriceSchema`（33-38 行目）・`priceRecordIdParamSchema`（41-43 行目）はそのまま
再利用し、追加するのは更新用リクエストボディ 1 本のみ。

```typescript
// 価格記録更新リクエストボディ。recordPriceSchema と同形（storeId: uuid / priceAmount: positive /
// packageSizeValue: positive / packageSizeUnit）。id・priceRecordId は URL param
// （priceRecordIdParamSchema）由来のため body に含めない。observedAt は編集対象外（D-1）のため
// フィールド自体が存在しない。
export const updatePriceRecordSchema = z.object({
  storeId: z.uuid(),
  priceAmount: priceAmountSchema, // z.number().positive().max(999_999_999)
  packageSizeValue: packageSizeValueSchema, // z.number().positive().max(9_999_999)
  packageSizeUnit: unitSchema,
});

export type UpdatePriceRecordBody = z.infer<typeof updatePriceRecordSchema>;
```

> **上限の追加（2026-08-06・セキュリティレビュー Medium 1 の対応）**: 当初は
> `z.number().positive()` のみとしていたが、上限が無いと検証を通った値が
> **HTTP 500 になる**ことが実 API で確認された。DB 精度
> （`price_amount` / `unit_price_amount` = `numeric(10,1)`、
> `package_size_value` = `numeric(10,3)`）に合わせた上限を共有定数
> `priceAmountSchema` / `packageSizeValueSchema` として切り出し、
> **`recordPriceSchema`（既存 POST）にも同じ上限を適用した**（ユーザー確定。
> 片方だけ直すと同じ入力で POST は 500・PUT は 400 という非対称が残るため）。
>
> 上限内でも「内容量が価格に対して極端に大きく単価が丸めで 0 になる」組み合わせは成立するため、
> Application 層に `UnitPriceNotPositiveError`（`InvalidOperationError` 派生 → **422**）を
> 新設し、`RecordPriceUseCase` / `UpdatePriceRecordUseCase` の両方で単価計算直後に検査する。
> 検証後の実測: ゼロ丸め → 422 / DB 精度超え → 400 / 正常値 → 200。

配置位置: `recordPriceSchema`（33-38 行目）の直後、`priceRecordIdParamSchema`（41-43 行目）の
前後どちらでもよいが、「価格記録の入力系スキーマをまとめる」観点で `recordPriceSchema` の直後を
推奨する。

### 1.2 `packages/api-contract/src/store.schema.ts` 追加分

既存 `idParamSchema`（`shared.schema.ts`）を param に再利用し、追加するのはリネーム用
リクエストボディ 1 本のみ。

```typescript
// 店舗リネームリクエストボディ。createStoreSchema と同形（name: nonBlankString, max 255）。
// id は URL param（idParamSchema）由来のため body に含めない。
export const renameStoreSchema = z.object({
  name: nonBlankString,
});

export type RenameStoreBody = z.infer<typeof renameStoreSchema>;
```

配置位置: `createStoreSchema`（8-10 行目）の直後を推奨する（作成・更新の入力系スキーマを
まとめる）。

レスポンス側は新規スキーマ不要。既存 `storeResponseSchema`（12-16 行目、
`{ id: string, name: string, createdAt: string }`）が `StoreDto` と同形であり、そのまま流用できる
（`GET /api/stores` 系の応答検証はすでにこのスキーマを前提に `docs/tests/store-master.md` が
書かれている）。

価格記録更新側も新規レスポンススキーマは不要。既存の `GET /api/products/:id`・
`PUT /api/products/:id` のいずれも `ProductDto` に対応する Zod レスポンススキーマを
`api-contract` に持たない（`c.json(product)` を返すのみで、型安全性は Hono RPC の型推論
（`AppType`）が担っている）。本エンドポイントもこの既存パターンをそのまま踏襲し、
`productResponseSchema` のような新規スキーマは追加しない。

### 1.3 `packages/api-contract/src/index.ts` への影響

**変更不要。** 両ファイルとも既に `export * from './product.schema'` /
`export * from './store.schema'` の対象であるため、追加したスキーマ・型は自動的に
`@cookpit/api-contract` から利用可能になる（`index.ts` 自体への追記は発生しない）。

---

## 2. スキーマ共有可否の判断（決定）

### 2.1 価格記録更新: `recordPriceSchema` を再利用せず、`updatePriceRecordSchema` として複製する

**決定: 複製する（別名で新設）。**

理由:

1. **既存の前例との整合**: `product.schema.ts` にはすでに `createProductSchema` /
   `updateProductSchema` という、フィールド構成が完全に同一でも意図的に別スキーマとして
   定義されている前例がある（19-31 行目）。この前例は「作成」と「更新」という**操作の意味が
   異なる**ことをスキーマレベルでも表現する設計判断であり、今回の「新規記録（`POST`）」と
   「更新（`PUT`）」の関係も同じ構造（操作の意味が違うが、現時点ではフィールドが同一）にある。
   一方だけ複製し、もう一方は共有するという扱いの違いを持ち込むと、`product.schema.ts` 内で
   一貫しない判断基準が生まれる。
2. **将来の変更の波及を断つ**: 要件定義書 D-1・D-3 により、価格記録の更新は「`observedAt` を
   変更しない」という新規記録には無い制約を持つ。現時点ではリクエストボディの形は同じでも、
   将来「更新固有のフィールド」（例: 変更理由メモなど、対象外だが将来課題として設計書
   §リスクに類似の申し送りがある）が追加された場合、共有していると新規記録側にも波及する。
   別スキーマにしておけば、その時に初めて分岐すればよく、今それを見越して過剰に抽象化
   （共通ベーススキーマの抽出等）する必要もない（YAGNI）。
3. **実害が小さい**: 3 フィールド × 2 スキーマの複製はコード量として軽微。DRY を厳密に適用する
   ほどの重複ではなく、`unitSchema`（17 値 union、`recipe.schema.ts` から import）のような
   「値の集合そのものが二重管理になりドリフトすると壊れる」ケースとは性質が異なる。

複製することの欠点（片方だけ変更してもう片方に追従し忘れるリスク）は認識した上で、
既存の `createProductSchema`/`updateProductSchema` も同じリスクを抱えたまま運用されており、
本タスクだけ異なる基準を採用する理由がないと判断する。

### 2.2 店舗リネーム: `createStoreSchema` を再利用せず、`renameStoreSchema` として新設する

**決定: 新設する（`createStoreSchema` の直接再利用はしない）。**

理由:

1. **§2.1 と同じ前例整合の論理**が店舗側にも当てはまる。`createStoreSchema` を
   `PUT /api/stores/:id` のボディ検証に直接 import して使うことも技術的には可能だが、
   それをすると `product.schema.ts` 側で確立した「作成/更新は別スキーマ」という一貫性が
   `store.schema.ts` だけ崩れる。
2. **命名の意図を型レベルでも保つ**: Domain 層は `Store.create()` と `Store.rename()` という
   別名のメソッドを持ち（設計書 §Domain 層）、Application 層も `CreateStoreUseCase` と
   `RenameStoreUseCase` という別クラスを持つ。リクエストスキーマだけ `createStoreSchema` を
   共用すると、「作成用スキーマを更新にも流用している」という層をまたいだ非対称（Domain/
   Application は別名・別クラスなのに api-contract だけ同一シンボル）が生まれる。
   `renameStoreSchema` という名前にすることで、Domain の `rename()` / Application の
   `RenameStoreUseCase` と呼び名が揃い、3 層を横断して同じ語彙で追跡できる。
3. `updateStoreSchema`（product 側の命名慣習に完全一致させる案）ではなく `renameStoreSchema`
   を選ぶ理由: 店舗の更新可能項目は名前 1 つのみで、将来的にも「更新」ではなく「リネーム」と
   いう単一の意味に固定される操作である（設計書 §対象外「店舗マスタの上限件数の変更」等、
   他の属性を持たせる計画はない）。`update` という汎用語より `rename` という具体語の方が
   実態を正確に表す。

---

## 3. Hono RPC エンドポイント契約

`docs/05-roadmap.md` の記載どおり `PUT` メソッド・パスを採用する（設計書 §API 設計で確認済み）。

### 3.1 `PUT /api/products/:id/price-records/:priceRecordId`

| 項目                       | 内容                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| ルーティング               | `apps/web/src/server/routes/products.ts` に `.put('/:id/price-records/:priceRecordId', ...)` を追加 |
| `zValidator('param', ...)` | `priceRecordIdParamSchema`（既存・再利用）                                                          |
| `zValidator('json', ...)`  | `updatePriceRecordSchema`（新規・§1.1）                                                             |
| UseCase                    | `UpdatePriceRecordUseCase(productRepository(), storeRepository())`                                  |
| 成功ステータス             | `200`                                                                                               |
| 成功レスポンス             | `ProductDto`（`c.json(product)`）                                                                   |
| 異常ステータス             | `404`（`ProductNotFoundError` / `PriceRecordNotFoundError` / `StoreNotFoundError`）、`400`（Zod）   |

Hono ルート実装イメージ（設計書 §バックエンド設計と同一。参考のみ・実装はしない）:

```typescript
.put(
  '/:id/price-records/:priceRecordId',
  zValidator('param', priceRecordIdParamSchema),
  zValidator('json', updatePriceRecordSchema),
  async (c) => {
    const { id, priceRecordId } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new UpdatePriceRecordUseCase(productRepository(), storeRepository());
    const product = await usecase.execute({ productId: id, priceRecordId, ...body });
    return c.json(product);
  },
)
```

### 3.2 `PUT /api/stores/:id`

| 項目                       | 内容                                                                            |
| -------------------------- | ------------------------------------------------------------------------------- |
| ルーティング               | `apps/web/src/server/routes/stores.ts` に `.put('/:id', ...)` を追加            |
| `zValidator('param', ...)` | `idParamSchema`（既存・再利用）                                                 |
| `zValidator('json', ...)`  | `renameStoreSchema`（新規・§1.2）                                               |
| UseCase                    | `RenameStoreUseCase(storeRepository())`                                         |
| 成功ステータス             | `200`                                                                           |
| 成功レスポンス             | `StoreDto`（`storeResponseSchema` 形。`c.json(store)`）                         |
| 異常ステータス             | `404`（`StoreNotFoundError`）、`422`（`DuplicateStoreNameError`）、`400`（Zod） |

Hono ルート実装イメージ（参考のみ・実装はしない）:

```typescript
.put(
  '/:id',
  zValidator('param', idParamSchema),
  zValidator('json', renameStoreSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new RenameStoreUseCase(storeRepository());
    const store = await usecase.execute({ id, ...body });
    return c.json(store);
  },
)
```

### 3.3 DTO・型契約の確認（変更しないことの確認）

設計書 §Application 層で提案されている入力 DTO をそのまま採用してよいと判断する。api-contract 側の
型と整合している。

| DTO                         | フィールド                                                                                                                                                       | api-contract 側の対応                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UpdatePriceRecordInputDto` | `productId: string`（param）/ `priceRecordId: string`（param）/ `storeId: string` / `priceAmount: number` / `packageSizeValue: number` / `packageSizeUnit: Unit` | `priceRecordIdParamSchema` の `{id, priceRecordId}` + `updatePriceRecordSchema` の 4 フィールド。型は完全一致（`Unit` は `unitSchema` の推論型と同一） |
| `RenameStoreInputDto`       | `id: string`（param）/ `name: string`                                                                                                                            | `idParamSchema` の `{id}` + `renameStoreSchema` の `{name}`。完全一致                                                                                  |

戻り値は `UpdatePriceRecordUseCase.execute(): Promise<ProductDto>` /
`RenameStoreUseCase.execute(): Promise<StoreDto>`。いずれも既存の `product.dto.ts` /
`store.dto.ts` の型をそのまま使い、DTO の新規フィールド追加は無い。

**nullability**: 新設する 2 つのリクエストボディ・レスポンス DTO のいずれにも新しい nullable
フィールドは無い。既存 `ProductDto` / `StoreDto` の nullability（`PriceRecordDto.storeName` は
非 null 確定済み等、`product-master.contract.md` §4 で確定済みの契約）をそのまま継承する。

---

## 4. U-1 最終確定: レスポンスボディ

**確定: 設計書の提案どおり `200 + ProductDto` を採用する（賛成）。**

要件定義書 U-1・設計書 §API 設計「なぜ ProductDto を返すか」を評価した結論を記す。

### 4.1 論拠の評価

設計書が挙げる 2 つの論拠（① 既存 `PUT /api/products/:id` が資源全体を返す慣習、②
隣接する `POST /price-records` は本文なし 200）はどちらも妥当。加えて、契約設計として次の
根拠を追加する。

1. **「使われないボディを返す」は本タスクが持ち込む新しいパターンではない**。実装コード
   （`apps/web/src/app/products/[id]/edit/_components/product-edit-form-client.tsx:57-66`）を
   確認したところ、既存の `PUT /api/products/:id` も呼び出し側は `response.ok` の真偽しか見ておらず、
   `response.json()` でボディを消費していない（`router.push()` → `router.refresh()` のみ）。
   つまりこのコードベースにはすでに「PUT は資源全体を返すが、クライアントは使わない」という
   契約が存在し、本タスクはその**既存パターンに合わせているだけ**であり、新しい設計上の
   負債を追加するものではない。
2. **Hono RPC の型安全性を将来に残す価値**: ボディを空にすると `AppType` 経由のクライアント型が
   `void`（または `null`）になり、将来「保存直後に楽観的更新でボディを使う」実装に変えたく
   なったときに契約変更（`PUT` のレスポンス型変更）が必要になる。`ProductDto` を返しておけば、
   Presentation 層側の実装だけ変えれば楽観的更新に切り替えられる。設計書が「将来クライアント側の
   状態管理を最適化する余地を残すため」と述べているのと同じ理由。
3. **コスト**: `ProductDto` を組み立てるための追加コストは `StoreRepository.findAll()` 1 回のみ
   （`toStoreNameMap()` 用）。これは既存の `UpdateProductUseCase.execute()`
   （`packages/application/src/product/update-product.use-case.ts:29-30`）が全く同じ理由・同じ
   コストで行っている処理であり、新しい負荷ではない。設計書 §性能の判定（対象外・商品 1 件規模）
   とも整合する。

### 4.2 反対案（本文なし 200）を採用しなかった理由

「`POST /price-records` と同じく本文なし 200 にする」案も検討したが、次の理由で不採用とする。

- `POST` と `PUT` はこのコードベースで意味的に区別されている（`POST /price-records` は「新規
  リソースを作るコマンド」、`PUT /:id` は「リソース全体の置き換え」）。今回の更新は `PUT` で
  あり、後者の慣習（資源全体を返す）に合わせる方が既存の `PUT /api/products/:id` との一貫性が
  高い。`POST /price-records` と同じ扱いにすると、同じ商品リソースに対する `PUT` が
  エンドポイントによって「ボディを返す/返さない」で分かれてしまい、クライアント側の型
  （Hono RPC）を見ても一貫した予測ができなくなる。
- 「使われないなら空にすべき」という原則は妥当だが、それを言うなら既存の
  `PUT /api/products/:id` も同じ問題を抱えている。今回だけ先に是正するのはスコープ外の
  リファクタリングであり、CLAUDE.md の「依頼スコープ外の改善はしない」に反する。是正するなら
  `PUT /api/products/:id` も含めた横断的な設計判断として別タスクで扱うべき事項であり、本書では
  現状の契約慣習に合わせることを優先する。

### 4.3 結論

`PUT /api/products/:id/price-records/:priceRecordId` は `200 + ProductDto` で確定する。

---

## 5. エラー契約

### 5-1. エラー形式

既存 `app.ts` の `onError`（24-33 行目）をそのまま使う。新しいエラークラスの追加は不要（設計書
§Application 層で列挙された `ProductNotFoundError` / `PriceRecordNotFoundError` /
`StoreNotFoundError` / `DuplicateStoreNameError` はいずれも既存クラスの再利用であり、新規エラー
クラスは無い）。全エラーレスポンスは `{ "error": string }` 形。

### 5-2. エラークラスと HTTP ステータスのマッピング

| エンドポイント                      | エラークラス                       | 継承元                  | HTTP | メッセージ例                                                                |
| ----------------------------------- | ---------------------------------- | ----------------------- | ---- | --------------------------------------------------------------------------- |
| `PUT /price-records/:priceRecordId` | `ProductNotFoundError`（既存）     | `NotFoundError`         | 404  | `"Product not found: <id>"`                                                 |
| 同上                                | `PriceRecordNotFoundError`（既存） | `NotFoundError`         | 404  | `"PriceRecord not found: <priceRecordId>"`                                  |
| 同上                                | `StoreNotFoundError`（既存）       | `NotFoundError`         | 404  | `"Store not found: <storeId>"`                                              |
| 同上                                | Zod バリデーション                 | —                       | 400  | `@hono/zod-validator` 標準形                                                |
| `PUT /stores/:id`                   | `StoreNotFoundError`（既存）       | `NotFoundError`         | 404  | `"Store not found: <id>"`                                                   |
| 同上                                | `DuplicateStoreNameError`（既存）  | `InvalidOperationError` | 422  | `"Store name '<name>' already exists"`（実装時に是正済み。※後述 §5-3 参照） |
| 同上                                | Zod バリデーション                 | —                       | 400  | `@hono/zod-validator` 標準形                                                |

`app.ts` への変更は不要。`NotFoundError` / `InvalidOperationError` の基底 2 分岐のみで両方とも
自動的にマッピングされる（`ProductNotFoundError` 等 4 クラスはすべてこの 2 基底のどちらかを
継承済み。§参照した既存契約で確認済み）。

### 5-3. 実装時に是正済み: `DuplicateStoreNameError` のメッセージ文言

本書の起票時点では、`DuplicateStoreNameError`
（`packages/application/src/store/duplicate-store-name.error.ts:15`）のメッセージが
`` `Cannot create Store: name '${attemptedName}' already exists` `` のままで、
`RenameStoreUseCase` から投げても「作成（create）」表記が残る点を申し送り事項として記録していた
（実装時にリファクタリングとして是正するか Orchestrator の判断を仰ぐ、としていた）。

実装時（実装計画 Step 14・Orchestrator 追加スコープ）に、メッセージを
`` `Store name '${attemptedName}' already exists` `` という作成・リネームどちらの操作にも
中立な文言へ修正した。同名判定のロジック・HTTP ステータス（422）・レスポンス形といった契約上の
決定内容は変更していない。§5-2 の「メッセージ例」列と §7.2 のサンプルペイロードは修正後の文言に
更新済み（本節末尾を参照）。

修正後のメッセージ例: `"Store name '<name>' already exists"`

---

## 6. 冪等性

`PUT` は本来べき等（同じリクエストを複数回送っても、サーバー状態が最初の 1 回目の結果と
同じになる）。両エンドポイントの実際の挙動を精査した結果を示す。

### 6-1. `PUT /price-records/:priceRecordId`: 実質べき等・`updatedAt` のみ非べき等

同一ボディを 2 回送信した場合:

| 項目                                                          | 1 回目                                                                                                     | 2 回目                                           | べき等か     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| `PriceRecord.id`                                              | 維持                                                                                                       | 維持                                             | べき等       |
| `PriceRecord.observedAt`                                      | 元の値を維持（設計書 D-1・D-3、`Product.updatePriceRecord()` が `original.observedAt` を明示的に引き継ぐ） | 1 回目と同じ値を維持                             | べき等       |
| `PriceRecord.storeId` / `price` / `unitPrice` / `packageSize` | リクエストボディの値                                                                                       | 同一ボディなら 1 回目と同じ値                    | べき等       |
| `Product.updatedAt`                                           | `touch()` により更新時刻に変わる                                                                           | `touch()` により**さらに新しい**更新時刻に変わる | **非べき等** |

**契約としての表現方針**: 「`ProductDto.priceHistory` の内容（各 `PriceRecordDto` の全フィールド）
は同一ボディでの再送に対してべき等。`ProductDto.updatedAt` のみ再送のたびに新しい値になる」と
明記する。これは新しい非対称ではなく、既存の `PUT /api/products/:id`（`Product.update()` も
`touch()` を呼ぶ。`packages/domain/src/product/product.ts:163`）と同じ既存の挙動であり、
本タスク固有の問題ではない。契約テストでは「`priceHistory` の該当レコードが 2 回目の呼び出しでも
同じ値を返す」ことを確認し、「`updatedAt` は 2 回目の呼び出しで変わりうる（変わらないことを
アサートしない）」ことをテスト設計上の注意点として test-designer に引き継ぐ（§9 参照）。

### 6-2. `PUT /stores/:id`: 完全にべき等

`Store` エンティティは `updatedAt` 相当のフィールドを持たない（`storeId` / `storeName` /
`createdAt` のみ。`createdAt` は `rename()` で変更されない）。同一ボディを 2 回送信した場合:

| 項目              | 1 回目                                                                          | 2 回目                        | べき等か                              |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| `Store.id`        | 維持                                                                            | 維持                          | べき等                                |
| `Store.name`      | リクエストボディの値                                                            | 同一ボディなら 1 回目と同じ値 | べき等                                |
| `Store.createdAt` | 不変                                                                            | 不変                          | べき等                                |
| 同名衝突判定      | `findByNormalizedName()` が自分自身をヒットしても除外（設計書 §Application 層） | 1 回目と同じロジックで除外    | べき等（N-08 で明示的にテストされる） |

`StoreDto`（`{id, name, createdAt}`）のすべてのフィールドが 2 回目の呼び出しでも完全に同一の
値になる。**`PUT /stores/:id` は `ProductDto` 側と異なり、レスポンスボディまで含めて完全に
べき等**であることを契約として明記する。

### 6-3. 冪等性キー

外部 I/O の新規追加が無いため（設計書 §エラー処理）、明示的な冪等性キー（`Idempotency-Key`
ヘッダー等）は導入しない。両エンドポイントとも `PUT` のパス自体（`:priceRecordId` /
`:id`）が対象リソースを一意に特定するキーとして機能し、それで十分と判断する。

---

## 7. サンプルペイロード

### 7.1 `PUT /api/products/:id/price-records/:priceRecordId`

```
PUT /api/products/550e8400-e29b-41d4-a716-446655440001/price-records/22222222-2222-4222-8222-222222222222
```

リクエストボディ:

```json
{
  "storeId": "550e8400-e29b-41d4-a716-446655440010",
  "priceAmount": 148,
  "packageSizeValue": 1,
  "packageSizeUnit": "個"
}
```

成功レスポンス（200・更新後の `ProductDto` 全体。編集対象の `PriceRecord` の `id`・`observedAt`
は変わらない）:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "玉ねぎ",
  "aliases": ["タマネギ", "オニオン"],
  "category": "野菜",
  "defaultUnit": "個",
  "priceHistory": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "storeId": "550e8400-e29b-41d4-a716-446655440010",
      "storeName": "コモディイイダ",
      "priceAmount": 148,
      "unitPriceAmount": 148,
      "packageSizeValue": 1,
      "packageSizeUnit": "個",
      "observedAt": "2026-06-20T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-06-20T10:00:00.000Z",
  "updatedAt": "2026-08-05T09:30:00.000Z"
}
```

エラーレスポンス例:

```json
// 404 ProductNotFoundError
{ "error": "Product not found: 550e8400-e29b-41d4-a716-446655440001" }

// 404 PriceRecordNotFoundError
{ "error": "PriceRecord not found: 22222222-2222-4222-8222-222222222222" }

// 404 StoreNotFoundError（storeId が存在しない）
{ "error": "Store not found: 00000000-0000-4000-8000-000000000000" }

// 400 Zod（priceAmount <= 0）
// @hono/zod-validator 標準形（success: false, error: ZodError シリアライズ）
```

### 7.2 `PUT /api/stores/:id`

```
PUT /api/stores/550e8400-e29b-41d4-a716-446655440010
```

リクエストボディ:

```json
{ "name": "コモディイイダ 高円寺店" }
```

成功レスポンス（200・`StoreDto`/`storeResponseSchema` 形。2 回連続で同じボディを送っても
このレスポンスは完全に同一になる §6-2）:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "name": "コモディイイダ 高円寺店",
  "createdAt": "2026-06-20T10:00:00.000Z"
}
```

エラーレスポンス例:

```json
// 404 StoreNotFoundError
{ "error": "Store not found: 550e8400-e29b-41d4-a716-446655440010" }

// 422 DuplicateStoreNameError（自分以外の既存店舗と正規化後に一致）
// 実装時に「作成」表記の文言を是正済み（§5-3 参照）
{ "error": "Store name 'ライフ' already exists" }

// 400 Zod（name が空白のみ、または 256 文字以上）
```

---

## 8. 後方互換性判定

**破壊的変更なし。** 判定根拠:

- `product.schema.ts` / `store.schema.ts` への追加はいずれも新規 `export` の追加のみで、
  既存の `createProductSchema` / `updateProductSchema` / `recordPriceSchema` /
  `priceRecordIdParamSchema` / `createStoreSchema` / `storeResponseSchema` / `storeSchema` /
  `storeUsageResponseSchema` の定義・型は一切変更しない。
- `apps/web/src/server/routes/products.ts` / `stores.ts` への変更は `.put()` チェーンの追加のみ。
  既存の `.get()` / `.post()` / `.delete()` ハンドラの実装・レスポンス形は変更しない
  （既存エンドポイントへの影響無し。設計書 §API 設計「既存エンドポイントへの影響」と一致）。
- `app.ts` の `onError` は変更不要（既存の `NotFoundError` / `InvalidOperationError` 基底 2 分岐が
  新規エラークラスの再利用をそのままカバーする）。
- DB スキーマ変更なし（設計書 §DB 設計・§Infrastructure 層 根拠のとおり）。既存データへの
  移行は不要。
- 新設する 2 エンドポイントはいずれも新しい URL パターン（`PUT` メソッド）であり、既存の
  クライアント（`apps/web` 内の Server Component・他フォーム）が呼んでいる経路と衝突しない。

---

## 9. 契約テスト方針（test-designer への橋渡し）

以下はテスト設計の観点まとめ。テストケースの詳細設計・実装は test-designer の責務。

### 9.1 `packages/api-contract/tests/product.schema.test.ts`（追記想定）

既存の `recordPriceSchema` describe ブロック（96-126 行目）と対になる形で
`updatePriceRecordSchema` の describe ブロックを追加する。

| 観点                                                                                            | テスト値                                                                                                                                         | 期待結果                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 正常な入力を受け入れる                                                                          | `{storeId: <uuid>, priceAmount: 148, packageSizeValue: 1, packageSizeUnit: '個'}`                                                                | 成功・値がそのまま返る                                                                     |
| 不正な storeId を reject する                                                                   | `storeId: 'not-a-uuid'`                                                                                                                          | 失敗                                                                                       |
| priceAmount が 0 / 負数を reject する                                                           | `priceAmount: 0` / `-1`                                                                                                                          | 失敗（`it.each` で `recordPriceSchema` と同じ 2 値を使う）                                 |
| packageSizeValue が 0 / 負数を reject する                                                      | `packageSizeValue: 0` / `-1`                                                                                                                     | 失敗                                                                                       |
| packageSizeUnit のプリセット外自由入力を受け入れ、空文字は reject する                          | `packageSizeUnit: '箱'` / `''`                                                                                                                   | 成功 / 失敗（`recordPriceSchema` の項目3ケースと同一観点）                                 |
| `recordPriceSchema` と `updatePriceRecordSchema` が独立したスキーマであることの確認（退行防止） | 2 つのスキーマの `.shape` のキー集合が一致することを確認する軽量テスト、または片方だけ変更しても他方のテストが影響を受けないことをコメントで明示 | 将来 §2.1 の複製方針が崩れて誤って同一参照に統合されないことの記録目的（必須ではなく任意） |

### 9.2 `packages/api-contract/tests/store.schema.test.ts`（追記想定）

既存の `createStoreSchema` describe ブロック（11-32 行目）と対になる形で `renameStoreSchema` の
describe ブロックを追加する。

| 観点                           | テスト値              | 期待結果          |
| ------------------------------ | --------------------- | ----------------- |
| 正常な name を受け入れる       | `{name: 'スーパーA'}` | 成功              |
| 空白のみの name を reject する | `''` / `'   '`        | 失敗（`it.each`） |
| 255 文字の name を受け入れる   | `'あ'.repeat(255)`    | 成功              |
| 256 文字の name を reject する | `'あ'.repeat(256)`    | 失敗              |
| name キーの省略を reject する  | `{}`                  | 失敗              |

### 9.3 Hono ルート契約テスト（apps/web 既存パターンに倣う。詳細は test-designer）

| 観点                                    | 確認内容                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT /price-records/:priceRecordId` 200 | 更新後の `ProductDto` が返り、`priceHistory` 内の該当レコードが新しい値・同じ `id`・同じ `observedAt` を持つこと                                             |
| 同 404×3                                | `ProductNotFoundError` / `PriceRecordNotFoundError` / `StoreNotFoundError` それぞれが独立して発生することを、商品なし・記録なし・店舗なしの 3 パターンで確認 |
| 同 400                                  | `priceAmount: 0` 等で `zValidator` が弾くこと                                                                                                                |
| 同 べき等性                             | 同一ボディで 2 回連続 `PUT` し、両方 200・`priceHistory` の該当レコードの値が一致すること（`updatedAt` は異なってよい。§6-1）                                |
| `PUT /stores/:id` 200                   | 更新後の `StoreDto` が返ること                                                                                                                               |
| 同 404                                  | 存在しない店舗 ID                                                                                                                                            |
| 同 422                                  | 自分以外の既存店舗と正規化後に名前が一致                                                                                                                     |
| 同 400                                  | name 空文字                                                                                                                                                  |
| 同 べき等性（N-08 対応）                | 同一 name で 2 回連続 `PUT` し、両方 200・レスポンスが完全に一致すること（422 にならないこと。§6-2）                                                         |
| 同 自己衝突除外（N-07 対応）            | 大文字小文字だけ変えた name で `PUT` が成功すること                                                                                                          |

### 9.4 型の往復・後方互換の確認観点

- `UpdatePriceRecordBody` / `RenameStoreBody` 型が `UpdatePriceRecordInputDto`（`storeId` /
  `priceAmount` / `packageSizeValue` / `packageSizeUnit` の 4 フィールド分）/
  `RenameStoreInputDto`（`name` フィールド分）と構造的に一致すること。
- 既存 `recordPriceSchema` / `createStoreSchema` のテストが本タスクの変更後も全件パスすること
  （§2 の「複製」判断により既存スキーマ自体は無変更のため、退行しないはずだが機械的に確認する）。
- `GET /api/products` / `GET /api/stores` など無関係な既存ルートが影響を受けないこと
  （§8 後方互換性判定の実行可能な形での確認）。

---

## 10. 実装ファイル一覧（参考・実装は implementer）

| ファイル                                             | 変更種別     | 内容                                                                              |
| ---------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `packages/api-contract/src/product.schema.ts`        | 追記         | `updatePriceRecordSchema` + 型（§1.1）                                            |
| `packages/api-contract/tests/product.schema.test.ts` | 追記         | §9.1 のテスト（test-designer 確定後に implementer が実装）                        |
| `packages/api-contract/src/store.schema.ts`          | 追記         | `renameStoreSchema` + 型（§1.2）                                                  |
| `packages/api-contract/tests/store.schema.test.ts`   | 追記         | §9.2 のテスト                                                                     |
| `apps/web/src/server/routes/products.ts`             | 追記         | `.put('/:id/price-records/:priceRecordId', ...)`（§3.1）                          |
| `apps/web/src/server/routes/stores.ts`               | 追記         | `.put('/:id', ...)`（§3.2）                                                       |
| `apps/web/src/server/app.ts`                         | **変更不要** | 既存 `NotFoundError`/`InvalidOperationError` 基底分岐がそのままカバーする（§5-2） |
| `packages/api-contract/src/index.ts`                 | **変更不要** | 既存の `export *` がそのまま新規シンボルを公開する（§1.3）                        |

Application 層（`UpdatePriceRecordUseCase` / `RenameStoreUseCase` / DTO・mapper 拡張）・Domain 層
（`Product.updatePriceRecord()` / `Store.rename()`）は設計書 §Application 層・§Domain 層の
記載どおりで、本書の対象外（契約設計は api-contract と Hono ルートの型契約のみ）。

---

## 11. 未決事項・申し送り

- **§5-3**: `DuplicateStoreNameError` のメッセージ文言が `RenameStoreUseCase` から投げても
  「Cannot **create** Store」のままになる。UI 表示には影響しないため契約としては許容するが、
  実装時に気になる場合は別タスク（本タスクのスコープ外のリファクタリング）として
  Orchestrator へ提起することを推奨する。本書はこの事実を記録するに留め、判断は下さない。
- **§6-1**: `PUT /price-records/:priceRecordId` の `updatedAt` が呼び出しごとに変わる非べき等性は、
  既存の `PUT /api/products/:id` と共通の既存挙動であり、本タスク固有の対応は不要と判断した。
  test-designer は `updatedAt` の値そのものをアサートせず、`priceHistory` の内容一致で
  べき等性を確認すること。
- 本書は要件定義書 U-1 について contract-designer として**確定**した（§4）。要件定義書・設計書の
  該当箇所（U-1 の記載）は Orchestrator が本書の確定を反映してステータス更新することを想定する
  （本書自体はプロダクションコード・設計書本体を変更しない制約のため、設計書側の反映は
  Orchestrator/後続工程に委ねる）。
- U-2（リネーム時の注意喚起の強さ）・U-3（ADR-0015 起票）は本書のスコープ外（Presentation 層・
  ADR の論点であり、契約設計の対象外）。設計書の記載どおり別途対応する。
