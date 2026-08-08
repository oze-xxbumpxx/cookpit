# Task 3: api-contract — updateStockSchema を追加

## 概要

在庫更新リクエストの Zod スキーマを追加する。参照する既存パターンは同ファイル内の
`addStockSchema`（`updateStockSchema` は**ここから `displayName` を除いた形**になる）。

対象は `packages/api-contract/` の 2 ファイルのみ。**他のパッケージには触れない。**

## アーキテクチャ制約

- 入出力スキーマは Zod（`packages/api-contract`）で定義し、API 契約として共有する。
- `any` 型は禁止。デフォルトエクスポート禁止（名前付きのみ）。
  型のみのインポートは `import type`。「値なし」は `null`（`undefined` と混在させない）。
- Zod のバージョンは **v4**（`^4.4.3`）。`z.iso.date()` / `z.uuid()` の v4 記法を使う
  （既存ファイルの書き方に揃える）。

## 実装対象ファイル

### 1. `packages/api-contract/src/pantry.schema.ts`（追記）

`addStockSchema` の**直後**に追加する。

```ts
/**
 * 在庫の詳細更新（PUT /api/pantry/stocks/:stockId）のリクエストボディ。
 *
 * 3 項目すべて必須キー（部分更新ではない）。`expiresAt` / `storedLocation` は
 * `null` を送ることでクリアを表す。`displayName` は編集対象外で、送られても
 * Zod の既定挙動（strip）で黙って無視される。
 */
export const updateStockSchema = z.object({
  amount: z.object({ value: z.number().positive(), unit: unitSchema }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});
```

型エイリアスをファイル末尾の `export type` 群に追加する（`AddStockBody` の近く）。

```ts
export type UpdateStockBody = z.infer<typeof updateStockSchema>;
```

### 2. `packages/api-contract/src/index.ts`

**変更不要。** 既存の `export *` が自動で公開する（確認だけして差分を出さないこと）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`.strict()` / `.passthrough()` を付けない。** `packages/api-contract/src` 全体で
  これらの明示呼び出しは 1 件も無く、Zod v4 の既定である **strip**（未知キーを黙って無視）に
  コードベース全体が揃っている。`displayName` を送っても **reject せず strip する**のが
  本スキーマの契約である（契約テストでこれを固定する）。
- **`optional()` を付けない。** 3 フィールドすべて**必須キー**。`nullable()` と `optional()` は
  別物で、`nullable()` は「キーは必要・値に `null` を許す」。キー省略を許すと `PATCH`
  （部分更新）の意味論になってしまい、P-2 の確定に反する。
- **`expiresAt` は `z.iso.date()`**（`YYYY-MM-DD`）。**`z.iso.datetime()` ではない。**
  同ファイルの `stockResponseSchema` には `purchasedAt: z.iso.datetime()` が並んでいるので
  取り違えやすい。`expiresAt` は日付のみ。
- **`addStockSchema` から `.omit({ displayName: true })` で派生させない。** 独立定義にする
  （契約設計書 §2.1 の確定。派生にすると `addStockSchema` 側の変更が意図せず波及する）。
- **フィールドの順序**は `amount` → `storedLocation` → `expiresAt`（`addStockSchema` から
  `displayName` を抜いた並びをそのまま維持する）。
- `amount.value` は **`.positive()`**（`0` を reject する）。`.nonnegative()` にしない。
- スキーマ名は `updateStockSchema`（`updateStockDetailsSchema` や `stockUpdateSchema` にしない）。
  型名は `UpdateStockBody`（`UpdateStockRequest` などにしない）。

## テスト

`packages/api-contract/tests/pantry.schema.test.ts` に追記する。既存ファイルの
`describe(スキーマ名)` 単位で `it` / `it.each` を積む形式に揃える。

試験計画 `docs/tests/stock-edit.md` §4（Z-UPD-01〜10）・契約設計書 §9.1 / §9.2 の観点。

**必須ケース**:

- `amount.value` が **0** で reject / 負値で reject / 小数（例 `1.25`）で受理
- `expiresAt` に **datetime 形式**（`'2026-08-07T00:00:00Z'`）を送ると **reject**
- `expiresAt: null` / `storedLocation: null` が受理される
- **キー省略が reject される**（`amount` / `storedLocation` / `expiresAt` の 3 通りそれぞれ）
- `storedLocation` に enum 外の値（例 `'garage'`）で reject
- **`displayName` を含めて送っても reject されず、`parse()` の戻り値に含まれない**
  （strip を契約として固定する）

## 完了条件

- [ ] `pnpm --filter @cookpit/api-contract test` 全 green
- [ ] `pnpm --filter @cookpit/api-contract type-check` / `pnpm lint` 全 green
- [ ] `packages/api-contract/src/index.ts` に差分が無い
- [ ] `addStockSchema` / `consumeStockSchema` / `stockResponseSchema` / `pantryResponseSchema` に
      差分が無い（既存スキーマを触らない）
- [ ] キー省略の reject と `displayName` の strip がテストで固定されている
