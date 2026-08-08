# 契約設計: stock-edit

> §背景・目的・ドメイン設計・Application 設計・UI 設計は `docs/designs/stock-edit.md`
> （§API 設計 / §変更後構成 api-contract / §エラー処理 / §確定事項）を参照。本書はその契約を
> `packages/api-contract`（Zod）・Hono RPC の型として実装可能な水準まで確定する。本体設計書と
> 矛盾する記述は無効（矛盾に気づいた場合は Orchestrator へ差し戻す。本書末尾「本体設計書との
> 差異メモ」に実測との差異を記録した）。

- ステータス: **confirmed**（本体設計書 P-1〜P-6 が 2026-08-07 にユーザー確定済み。本書は
  その契約実装詳細のみを確定する。ユーザー確認を要する新規論点は無し）
- 対象: `packages/api-contract/src/pantry.schema.ts`（Zod 追記）、
  Hono RPC（`apps/web/src/server/routes/pantry.ts` 追記）
- 参照した既存契約: `pantry.schema.ts` / `shopping-list.schema.ts` / `index.ts` / `app.ts` /
  `routes/pantry.ts` / `packages/api-contract/tests/pantry.schema.test.ts` /
  `apps/web/tests/server/routes/pantry.test.ts`
- プロダクションコードは変更しない（実装は implementer）。DB スキーマ変更なし
  （本体設計書 §DB 設計）。

---

## 目次

1. [エンドポイント仕様（既存 4 本との比較）](#1-エンドポイント仕様既存-4-本との比較)
2. [`updateStockSchema` の定義と `addStockSchema` との差分](#2-updatestockschema-の定義と-addstockschema-との差分)
3. [バリデーション規則](#3-バリデーション規則)
4. [ステータスコードとエラー形式（実測）](#4-ステータスコードとエラー形式実測)
5. [nullability と「値なし」の表現](#5-nullability-と値なしの表現)
6. [冪等性](#6-冪等性)
7. [後方互換性判定](#7-後方互換性判定)
8. [サンプルペイロード](#8-サンプルペイロード)
9. [契約テスト方針（test-designer への橋渡し）](#9-契約テスト方針test-designer-への橋渡し)
10. [買い物完了 API は契約変更なし（確認・記録）](#10-買い物完了-api-は契約変更なし確認記録)
11. [実装ファイル一覧（参考・実装は implementer）](#11-実装ファイル一覧参考実装は-implementer)
12. [本体設計書との差異メモ・申し送り](#12-本体設計書との差異メモ申し送り)

---

## 1. エンドポイント仕様（既存 4 本との比較）

新規エンドポイントは次の 1 本のみ（本体設計書 §API 設計・確定事項どおり）。

| メソッド | パス                                      | UseCase                             | パスパラメータ                       | リクエストボディ              | レスポンスボディ                      | ステータス            |
| -------- | ----------------------------------------- | ----------------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------- | --------------------- |
| GET      | `/api/pantry`                             | `GetPantryUseCase`                  | なし                                 | なし                          | `PantryDto`（`pantryResponseSchema`） | 200                   |
| POST     | `/api/pantry/stocks`                      | `AddStockUseCase`                   | なし                                 | `AddStockBody`                | `PantryDto`                           | 201                   |
| POST     | `/api/pantry/stocks/:stockId/consume`     | `ConsumeStockUseCase`               | `stockIdParamSchema`                 | `ConsumeStockBody`            | `PantryDto`                           | 200 / 404 / 422 / 400 |
| POST     | `/api/pantry/stocks/:stockId/discard`     | `DiscardStockUseCase`               | `stockIdParamSchema`                 | なし                          | `PantryDto`                           | 200 / 404 / 400       |
| **PUT**  | **`/api/pantry/stocks/:stockId`**（新規） | `UpdateStockDetailsUseCase`（新規） | `stockIdParamSchema`（既存を再利用） | `UpdateStockBody`（新規・§2） | `PantryDto`                           | 200 / 404 / 422 / 400 |

- パスパラメータは既存の `stockIdParamSchema`（`z.object({ stockId: z.uuid() })`）を**そのまま
  再利用**する。新規 param スキーマは無い。
- レスポンスは既存の `pantryResponseSchema`（`{ stocks: StockDto[] }`）を**そのまま返す**
  （`consume` / `discard` と同じく更新後の Pantry 全体）。新規レスポンススキーマは無い。
- `PATCH` は導入しない（本体設計書 P-2 確定: 全項目必須の `PUT`。「省略と null の違いを常に
  正しく扱う実装コスト」を避ける判断）。

Hono ルート実装イメージ（参考のみ・実装はしない。本体設計書 §Presentation route と同一）:

```typescript
.put(
  '/stocks/:stockId',
  zValidator('param', stockIdParamSchema),
  zValidator('json', updateStockSchema),
  async (c) => {
    const { stockId } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new UpdateStockDetailsUseCase(pantryRepository());
    const dto = await usecase.execute({ stockId, ...body });
    return c.json(dto, 200);
  },
)
```

配置位置: `pantry.ts` の `.post('/stocks/:stockId/discard', ...)` の直後（メソッド別に
`GET → POST(add) → POST(consume) → POST(discard) → PUT(update)` の並びを維持する）。

---

## 2. `updateStockSchema` の定義と `addStockSchema` との差分

### 2.1 定義（`packages/api-contract/src/pantry.schema.ts` 追記）

```typescript
export const updateStockSchema = z.object({
  amount: z.object({
    value: z.number().positive(), // 0 を拒否（§3 参照）
    unit: unitSchema,
  }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(), // datetime ではなく date（YYYY-MM-DD）
});

export type UpdateStockBody = z.infer<typeof updateStockSchema>;
```

配置位置: `addStockSchema`（17-25 行目）の直後を推奨する（作成・更新の入力系スキーマを
まとめる。`price-record-edit-and-store-rename.contract.md` §1.1 と同じ配置方針）。

### 2.2 `addStockSchema` との差分表

| フィールド       | `addStockSchema`（既存）                                    | `updateStockSchema`（新規）     | 差分                                            |
| ---------------- | ----------------------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| `displayName`    | `z.string().min(1)`（必須）                                 | **無し**                        | 削除。編集対象外（本体設計書 対象外・P-1 確定） |
| `amount.value`   | `z.number().positive()`（必須）                             | `z.number().positive()`（必須） | 変更なし。同一制約を共有                        |
| `amount.unit`    | `unitSchema`（必須）                                        | `unitSchema`（必須）            | 変更なし                                        |
| `storedLocation` | `storageLocationSchema.nullable()`（必須キー・値 nullable） | 同左                            | 変更なし                                        |
| `expiresAt`      | `z.iso.date().nullable()`（必須キー・値 nullable）          | 同左                            | 変更なし                                        |

**共有せず複製する判断**: `addStockSchema` から `displayName` を除いた残り 3 フィールドは
値レベルで完全に同一だが、`price-record-edit-and-store-rename.contract.md` §2.1/§2.2 と同じ
論拠（作成/更新は操作の意味が異なる・既存の `addStockSchema` は変更しない・将来更新固有の
フィールドが増えても新規記録側に波及しない）により、`addStockSchema` を `.omit()` する等の
派生ではなく**独立した新規スキーマとして定義する**。`consumeStockSchema` /
`stockAdditionSchema`（`shopping-list.schema.ts`）も同様に `amount` / `storedLocation` /
`expiresAt` のプリミティブを都度独立に定義しており、このコードベースの既存慣習と一致する。

### 2.3 `index.ts` への影響

**変更不要。** `pantry.schema.ts` は既に `packages/api-contract/src/index.ts` から
`export * from './pantry.schema'` されている（`pantry-core-contract.md` §1.2 で確定済み）ため、
`updateStockSchema` / `UpdateStockBody` は自動的に `@cookpit/api-contract` から利用可能になる。

---

## 3. バリデーション規則

| フィールド       | 規則                                                             | 理由                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amount.value`   | `z.number().positive()`（0 拒否・小数許容）                      | 在庫 0 は `consumeStock` が集約から除去する概念であり、編集で 0 を設定できると「集約に残る 0 個の在庫」という不変条件に反する状態を作れてしまう（本体設計書 R-6・`Stock.updateDetails` の Domain 側最終防御線と対になる契約層の早期拒否）。小数（例: `0.5`）は `positive()` が整数制約を課さないため受理される（既存 `addStockSchema.amount.value` と同一制約であり、既存の重量系単位（`g`/`kg`/`ml`/`l`）の入力実態と整合） |
| `amount.unit`    | `unitSchema`（`recipe.schema.ts` から import）                   | 既存 17 種のプリセット + 自由入力文字列（空文字は reject）。`addStockSchema` / `consumeStockSchema` と共通の単一情報源                                                                                                                                                                                                                                                                                                       |
| `expiresAt`      | `z.iso.date().nullable()`（`YYYY-MM-DD`。**datetime ではない**） | `StockDto.expiresAt` はローカル日付文字列（本体設計書「ローカル日付の往復規約」）であり、タイムゾーンを含む ISO datetime（`2026-08-07T00:00:00Z`）を受理すると `new Date(\`${input.expiresAt}T00:00:00\`)`（Application 層）の組み立て前提が崩れる。`addStockSchema`/`stockAdditionSchema` と同一のバリデータを再利用し、日付・日時の 2 形式が混在しないようにする                                                           |
| `storedLocation` | `storageLocationSchema`（`'fridge' \| 'freezer' \| 'pantry'`）   | `addStockSchema` / `consumeStockSchema` と共有する唯一の enum。将来値を追加する場合もこの 1 箇所の変更で全 API に波及する                                                                                                                                                                                                                                                                                                    |

3 フィールドとも**必須キー**（`optional()` を付けない）。§5 で扱う。

---

## 4. ステータスコードとエラー形式（実測）

### 4-1. 実測結果

`apps/web/src/server/app.ts`（24-33 行目）の `onError` を実測した結果、次の 2 段の基底分岐のみで
全エラーがマッピングされる。**新規エラークラス・`app.ts` の変更は不要**（本体設計書の記載どおり）。

```typescript
app.onError((err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidOperationError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
```

`zValidator`（`@hono/zod-validator`）によるバリデーション失敗は `onError` を経由せず、
**`@hono/zod-validator` が自前で `400`** を返す。これは `apps/web/tests/server/routes/pantry.test.ts`
の既存テスト（112-152 行目、`POST /api/pantry/stocks` の `displayName` 空文字・
`amount.value: 0` のケース）で `res.status === 400` かつ `execute` が呼ばれないことを実測確認した
（UseCase に到達する前に弾かれる）。既存テストはステータスのみをアサートしレスポンスボディの
形は固定していないため、本書ではボディ形を「`@hono/zod-validator` 標準形（`success: false` と
`ZodError` のシリアライズを含むオブジェクト）」とだけ記す。これは
`price-record-edit-and-store-rename.contract.md` §5-2 が採用したのと同じ記述レベルである。

### 4-2. `PUT /api/pantry/stocks/:stockId` のステータス・エラー対応表

| ステータス | 発生条件                                                                                                                                             | エラークラス / 主体                                                 | レスポンスボディ                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| 200        | 正常更新                                                                                                                                             | —                                                                   | `PantryDto`（`pantryResponseSchema`） |
| 400        | `updateStockSchema` の Zod バリデーション失敗（`amount.value` が 0 以下、`expiresAt` が date 形式でない、`storedLocation` が enum 外、キー省略など） | `@hono/zod-validator`（UseCase 未到達）                             | `@hono/zod-validator` 標準形          |
| 404        | 指定した `stockId` の在庫が存在しない                                                                                                                | `StockNotFoundError`（既存） → `NotFoundError` 継承                 | `{ "error": "<message>" }`            |
| 422        | UseCase/Domain 層で `amount.value <= 0` 等の不変条件違反（契約層の 400 をすり抜けた将来の呼び出し元に対する最終防御線）                              | `InvalidStockOperationError`（既存） → `InvalidOperationError` 継承 | `{ "error": "<message>" }`            |

`StockNotFoundError` / `InvalidStockOperationError` は本体設計書「Application」節に記載の
**既存**エラークラス（`ConsumeStockUseCase` / `DiscardStockUseCase` と共有）であり、本ユニットで
新設するエラークラスは無い。

---

## 5. nullability と「値なし」の表現

- プロジェクト規約（`.claude/rules/coding-standards.md`）どおり「値なし」は `null` に統一し、
  `undefined` とは混在させない。
- `storedLocation` / `expiresAt` は **`nullable()`** であって `optional()` ではない。クライアントは
  クリアしたい場合に**明示的に `null` を送る**。
- 3 フィールドとも**キー省略を許さない**（`z.object()` の各フィールドは `optional()` を付けて
  いないため、キーが無い入力は Zod のバリデーション失敗＝ 400 になる）。これは `PATCH`
  （部分更新）を却下した P-2 の判断と対になる契約上の帰結であり、「省略＝変更しない」という
  意味を持たせない設計を型レベルでも強制する。
- `amount` は必須（`null` 不可）。在庫は常に何らかの数量を持つという不変条件（`Stock` が
  `amount: Quantity` を必須フィールドとして持つ）をそのまま反映する。

---

## 6. 冪等性

`PUT` は本来べき等（同じリクエストを複数回送っても、サーバー状態が最初の 1 回目の結果と
同じになる）。

| 項目                             | 1 回目                   | 2 回目（同一ボディ） | べき等か |
| -------------------------------- | ------------------------ | -------------------- | -------- |
| 対象 `Stock` の `amount`         | リクエストボディの値     | 1 回目と同じ値       | べき等   |
| 対象 `Stock` の `expiresAt`      | リクエストボディの値     | 1 回目と同じ値       | べき等   |
| 対象 `Stock` の `storedLocation` | リクエストボディの値     | 1 回目と同じ値       | べき等   |
| 対象 `Stock` の `id`             | 維持（URL param が特定） | 維持                 | べき等   |
| `PantryDto.stocks`（他の Stock） | 不変                     | 不変                 | べき等   |

`Stock` は `price-record-edit-and-store-rename.contract.md` の `Product` と異なり
`updatedAt` 相当のタイムスタンプフィールドを持たない（本体設計書「現状構成 — Domain」の
`Stock` フィールド一覧に `updatedAt` は無い）ため、`PUT /api/pantry/stocks/:stockId` は
**レスポンスボディまで含めて完全にべき等**である。

**`POST .../consume` との対照**: `ConsumeStockUseCase` は残量を減算する操作であり、同一ボディを
2 回送ると 1 回目と 2 回目で結果（残量）が異なる**非べき等**な操作である。今回の `PUT` は
「現在の値を指定の値に置き換える」操作であり、この非べき等性を持たない。両者の意味論の違いを
契約上も明確にしておく。

冪等性キー（`Idempotency-Key` ヘッダー等）は外部 I/O の新規追加が無いため導入しない
（本体設計書「エラー処理」節と同じ判断。`PUT` のパス自体（`:stockId`）が対象リソースを
一意に特定するキーとして機能する）。

---

## 7. 後方互換性判定

**破壊的変更なし。**

- `pantry.schema.ts` への追加は `updateStockSchema` / `UpdateStockBody` という新規 `export` の
  追加のみで、既存の `stockIdParamSchema` / `consumeStockSchema` / `storageLocationSchema` /
  `addStockSchema` / `stockResponseSchema` / `pantryResponseSchema` の定義・型は一切変更しない。
- `apps/web/src/server/routes/pantry.ts` への変更は `.put()` チェーンの追加のみ。既存の
  `.get()` / `.post()`（add / consume / discard）ハンドラの実装・レスポンス形は変更しない。
- `app.ts` の `onError` は変更不要（§4-1 で実測確認済み）。
- DB スキーマ変更なし（本体設計書 §DB 設計）。既存データへの移行は不要。
- `StockDto`（レスポンス形。`stockResponseSchema` に対応）は変更しない。フィールドの追加・
  削除・型変更・nullability の変更は無い。
- `shopping-list.schema.ts` への変更は無い（§10 で確認）。
- **Hono RPC の型伝播**: `AppType`（`apps/web/src/server/app.ts` の `export type AppType`）は
  ルートの静的型から自動導出されるため、`.put('/stocks/:stockId', ...)` を追加すると
  フロント側の `client.api.pantry.stocks[':stockId'].$put({ param, json })` が型安全に
  利用可能になる（`price-record-edit-dialog.tsx` の `client.api.products[':id']['price-records']
[':priceRecordId'].$put(...)` と同型のパターン）。既存の `client.api.pantry.stocks[...]`
  の他メソッド（`.$post`）の型は変更されない（新しいプロパティの追加のみで、既存プロパティは
  維持される TypeScript の構造的部分型の性質による）。

---

## 8. サンプルペイロード

```
PUT /api/pantry/stocks/11111111-1111-4111-8111-111111111111
```

### 8.1 成功（200）

リクエストボディ:

```json
{
  "amount": { "value": 2, "unit": "個" },
  "storedLocation": "fridge",
  "expiresAt": "2026-08-20"
}
```

成功レスポンス（200・更新後の `PantryDto` 全体。対象 Stock の `id` / `displayName` /
`productId` / `purchasedAt` は変わらない）:

```json
{
  "stocks": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "productId": null,
      "displayName": "玉ねぎ",
      "amount": { "value": 2, "unit": "個" },
      "purchasedAt": "2026-07-17T01:00:00.000Z",
      "expiresAt": "2026-08-20",
      "storedLocation": "fridge"
    }
  ]
}
```

### 8.2 クリア（storedLocation / expiresAt を null に）

リクエストボディ:

```json
{
  "amount": { "value": 2, "unit": "個" },
  "storedLocation": null,
  "expiresAt": null
}
```

### 8.3 404（`StockNotFoundError`）

```
PUT /api/pantry/stocks/00000000-0000-4000-8000-000000000000
```

```json
{ "error": "Stock not found: 00000000-0000-4000-8000-000000000000" }
```

> メッセージ文言は実装時に確定する（既存 `StockNotFoundError` のメッセージ形式に揃える。
> 本書では `ConsumeStockUseCase` 等が投げる既存メッセージと同型であることのみを契約とする）。

### 8.4 422（`InvalidStockOperationError`。契約層 400 をすり抜けた場合の最終防御線）

```json
{ "error": "Stock amount must be positive" }
```

> Zod の `positive()` が境界で先に拒否するため、通常の呼び出しでは 400 になる。422 は
> Domain/UseCase 層の不変条件チェックが最終防御線として機能した場合の契約であり、
> 通常のクライアント経由では到達しない想定（本体設計書「エラー処理」節）。

### 8.5 400（Zod バリデーション失敗）

```json
// amount.value: 0
{ "amount": { "value": 0, "unit": "個" }, "storedLocation": null, "expiresAt": null }

// expiresAt が datetime 形式（date ではない）
{ "amount": { "value": 1, "unit": "個" }, "storedLocation": null, "expiresAt": "2026-08-07T00:00:00Z" }

// storedLocation が enum 外
{ "amount": { "value": 1, "unit": "個" }, "storedLocation": "counter", "expiresAt": null }

// キー省略（storedLocation を省略）
{ "amount": { "value": 1, "unit": "個" }, "expiresAt": null }
```

いずれも `@hono/zod-validator` 標準形のエラーボディで **400**（§4 参照）。

---

## 9. 契約テスト方針（test-designer への橋渡し）

以下はテスト設計の観点まとめ。テストケースの詳細設計・実装は test-designer の責務。配置先は
`packages/api-contract/tests/pantry.schema.test.ts`（既存ファイルへの追記。既存の `addStockSchema`
describe ブロック（117-151 行目）と対になる形で `updateStockSchema` の describe ブロックを追加）。

### 9.1 `updateStockSchema` の観点

| 観点                                                                                     | テスト値                                                                                  | 期待結果                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 必須 3 項目すべて埋めた入力を受け入れる                                                  | `{ amount: { value: 2, unit: '個' }, storedLocation: 'fridge', expiresAt: '2026-08-20' }` | 成功                                                                                                     |
| `storedLocation` / `expiresAt` が `null` の入力を受け入れる                              | 上記の `storedLocation: null, expiresAt: null`                                            | 成功                                                                                                     |
| `amount.value` が **0** の入力を reject する                                             | `amount.value: 0`                                                                         | 失敗                                                                                                     |
| `amount.value` が**負値**の入力を reject する                                            | `amount.value: -1`                                                                        | 失敗                                                                                                     |
| `amount.value` が**小数**の入力を受け入れる                                              | `amount.value: 0.5`（`unit: 'g'` 等）                                                     | 成功（実測: `positive()` は整数制約を課さない）                                                          |
| `expiresAt` に **datetime 形式**（`2026-08-07T00:00:00Z`）を送ると reject される         | `expiresAt: '2026-08-07T00:00:00Z'`                                                       | 失敗（`z.iso.date()` は `YYYY-MM-DD` のみ許容）                                                          |
| `storedLocation` に enum 外の値を送ると reject される                                    | `storedLocation: 'counter'`                                                               | 失敗                                                                                                     |
| **キーを省略すると reject される**（部分更新を許さないことの確認・3 項目それぞれ個別に） | `amount` 省略 / `storedLocation` 省略 / `expiresAt` 省略の 3 パターン（`it.each` 等）     | 失敗（いずれも）。**`PATCH` を導入しない設計判断を型レベルで固定する回帰テスト**                         |
| **`displayName` を送ったときの挙動**（strip されるか reject されるかを固定）             | `{ ...VALID_UPDATE_STOCK, displayName: '玉ねぎ' }`                                        | **成功・かつ `parse()` の戻り値に `displayName` キーが含まれない**（Zod の既定 `strip` 挙動。§9.2 参照） |
| 空文字の `amount.unit` を reject する（`unitSchema` の既存制約）                         | `amount.unit: ''`                                                                         | 失敗                                                                                                     |
| プリセット外の自由入力単位を受け入れる                                                   | `amount.unit: '箱'`                                                                       | 成功（`addStockSchema` / `consumeStockSchema` と同じ `unitSchema` 挙動）                                 |

### 9.2 `displayName` の挙動確定（実測に基づく契約）

**確定: strip（無視）される。reject はしない。**

根拠: `updateStockSchema` は `z.object({...})` として定義され、`.strict()` / `.passthrough()`
のいずれも呼ばない。`packages/api-contract/src` 全体を grep した結果、`.strict()` /
`.passthrough()` / `.strip()` の明示呼び出しは 1 件も無く、既存の全スキーマ（`addStockSchema`
含む）が Zod v4（`package.json` で `"zod": "^4.4.3"`）の**既定の `ZodObject` 挙動（未知キーは
`strip`）**にそろって依存している。この既存慣習を踏襲し、`updateStockSchema` も未知キー
（`displayName` を含む）を黙って落とす（reject しない）契約とする。

**このことを契約テストで固定する理由**: `displayName` はエンドポイント設計上「対象外」
（本体設計書 対象外・P-1 確定）だが、クライアント実装のミスで誤って送ってしまった場合に
400 で弾かれず黙って無視される（＝更新は成功するが `displayName` の変更は反映されない）と
いう挙動は、実装者が把握しておくべき契約情報である。`.strict()` に変更して意図的に reject する
という代替案もあり得るが、本書では**既存コードベース全体の一貫性**（`addStockSchema` 等
既存スキーマもすべて `strip`）を優先し、`updateStockSchema` だけ `.strict()` にする変更は
提案しない（提案する場合は既存スキーマ全体の方針転換であり、本タスクのスコープ外の
リファクタリングになる）。

### 9.3 Hono ルート契約テスト（`apps/web/tests/server/routes/pantry.test.ts` 追記想定）

| 観点                        | 確認内容                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /stocks/:stockId` 200  | 更新後の `PantryDto` が返り、対象 Stock の `amount`/`expiresAt`/`storedLocation` が新しい値、`id`/`displayName`/`productId`/`purchasedAt` は元のまま |
| 同 404                      | 存在しない `stockId`（`StockNotFoundError`）                                                                                                         |
| 同 422                      | UseCase/Domain 層のガードに到達するケース（契約層 400 をすり抜けたことを模したモック等。詳細は test-designer）                                       |
| 同 400 × 4                  | `amount.value: 0` / `expiresAt` が datetime 形式 / `storedLocation` が enum 外 / いずれかのキー省略、それぞれで `execute` が呼ばれないこと           |
| 同 べき等性                 | 同一ボディで 2 回連続 `PUT` し、両方 200・レスポンスの対象 Stock 部分が完全一致すること（§6）                                                        |
| 既存 4 エンドポイントの回帰 | `GET` / `POST(add)` / `POST(consume)` / `POST(discard)` の既存テストが全件パスすること（§7 後方互換性判定の実行可能な形での確認）                    |

### 9.4 型の往復・後方互換の確認観点

- `UpdateStockBody` 型が `UpdateStockDetailsInputDto`（本体設計書「Application」節。
  `stockId` は param 由来のため除く）の `amount` / `expiresAt` / `storedLocation` の 3
  フィールドと構造的に一致すること。
- 既存 `addStockSchema` / `consumeStockSchema` / `stockResponseSchema` / `pantryResponseSchema`
  のテストが本タスクの変更後も全件パスすること（§2 の「複製」判断により既存スキーマ自体は
  無変更のため、退行しないはずだが機械的に確認する）。
- `GET /api/pantry` / `POST /api/pantry/stocks` など無関係な既存ルートが影響を受けないこと。

---

## 10. 買い物完了 API は契約変更なし（確認・記録）

**確定: `stockAdditionSchema` / `completeShoppingSchema`（`shopping-list.schema.ts`）は
契約変更が不要である。**

実測結果（`shopping-list.schema.ts` 44-53 行目）:

```typescript
export const stockAdditionSchema = z.object({
  itemId: z.uuid(),
  amount: z.object({
    value: z.number().positive(),
    unit: unitSchema,
  }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});
```

`expiresAt: z.iso.date().nullable()` は**既に**存在し、`updateStockSchema` の `expiresAt` と
完全に同一の制約（`YYYY-MM-DD` 形式・nullable・必須キー）を持つ。`storedLocation` も
`pantry.schema.ts` の `storageLocationSchema` を import して共有しており、こちらも変更不要。

**変更が不要である理由**: 本ユニットで変わるのはサーバー側の契約ではなく、
**クライアント側（`complete-shopping-panel.tsx`）が `expiresAt: null` を固定送信するのを
やめて実際の入力値を送るようになる**という UI 側の挙動のみである
（本体設計書「Application」節「`complete-shopping.use-case.ts` は変更不要」・「UI 設計」節
「買い物完了パネルの改修」）。スキーマは「`expiresAt` として日付文字列 or `null` を受け付ける」
という契約を変更前から満たしており、送信される**値の分布**が変わるだけで**契約（型・
バリデーション規則）は変わらない**。

このため:

- `packages/api-contract/src/shopping-list.schema.ts` への変更は**無い**。
- `packages/api-contract/tests/shopping-list.schema.test.ts` への新規テスト追加も**不要**
  （既存の `stockAdditionSchema` の `expiresAt` バリデーションテストがあればそれで十分。
  無い場合でも、それは本ユニットのスコープではなく既存契約のテストカバレッジの問題として
  別途扱う）。
- `apps/web/src/server/routes/shopping-lists.ts` のルート定義・エラー処理・ステータスコードも
  変更不要。

「契約変更が不要であることを確認・記録する」こと自体が本節の成果である
（本書冒頭「作業指示」に基づく明示節）。

---

## 11. 実装ファイル一覧（参考・実装は implementer）

| ファイル                                            | 変更種別     | 内容                                                                            |
| --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `packages/api-contract/src/pantry.schema.ts`        | 追記         | `updateStockSchema` + `UpdateStockBody` 型（§2.1）                              |
| `packages/api-contract/tests/pantry.schema.test.ts` | 追記         | §9.1・§9.2 のテスト（test-designer 確定後に implementer が実装）                |
| `apps/web/src/server/routes/pantry.ts`              | 追記         | `.put('/stocks/:stockId', ...)`（§1）                                           |
| `apps/web/tests/server/routes/pantry.test.ts`       | 追記         | §9.3 のテスト                                                                   |
| `apps/web/src/server/app.ts`                        | **変更不要** | 既存 `NotFoundError`/`InvalidOperationError` 基底分岐がそのままカバーする（§4） |
| `packages/api-contract/src/index.ts`                | **変更不要** | 既存の `export *` がそのまま新規シンボルを公開する（§2.3）                      |
| `packages/api-contract/src/shopping-list.schema.ts` | **変更不要** | `stockAdditionSchema` は既に `expiresAt` を受け付ける形（§10）                  |

Application 層（`UpdateStockDetailsUseCase`）・Domain 層（`Stock.updateDetails` /
`Pantry.updateStockDetails`）・Infrastructure 層（`onConflictDoUpdate.set` の 4 列拡張）は
本体設計書の記載どおりで、本書の対象外（契約設計は api-contract と Hono ルートの型契約のみ）。

---

## 12. 本体設計書との差異メモ・申し送り

- 本体設計書（`stock-edit.md`）§変更後構成 api-contract で示された `updateStockSchema` の
  コード（395-401 行目）と、本書 §2.1 の定義は**完全に一致**する。実測により追加・修正した
  情報は無い。
- 実測で判明した既存の慣行（本体設計書に明記が無かった点）:
  - Zod バリデーション失敗時のステータスは **400**（`@hono/zod-validator` が UseCase 到達前に
    自前で返す。`onError` を経由しない）。本体設計書は「422（`InvalidStockOperationError`）」
    のみを明記しており、契約層の 400 と Domain 層の 422 の 2 段構えである点は本書 §4 で
    明確化した。
  - `displayName` を送った場合は **strip**（reject ではない）。本体設計書には記載が無かった
    ため、本書 §9.2 で実測・確定した。
  - 既存の Hono ルートテスト（`pantry.test.ts`）はエラーレスポンスの**ボディ形**までは
    アサートしておらず、ステータスコードのみを確認している。本書 §4-1 もこれに合わせ、
    ボディ形は「`@hono/zod-validator` 標準形」とだけ記述する（`price-record-edit-and-
store-rename.contract.md` と同じ記述レベル）。
- `updateStockSchema` の配置位置・命名は本体設計書のコードをそのまま踏襲し、契約設計として
  新たな論点は無い。ユーザー確認が必要な後方互換破壊・移行方針の論点も無い（§7）。
