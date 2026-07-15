# Task 4: API Contract 層 — pantry.schema.ts（Zod）

## 概要

`packages/api-contract/src/pantry.schema.ts`（Zod 5 スキーマ）と契約テストを新規作成する。
契約書 `docs/designs/pantry-core-contract.md` §1 の確定形の転記が中心。
**模範コード**: `packages/api-contract/src/shopping-list.schema.ts` + `.test.ts`。

依存: Task 3（`PantryDto`/`StockDto` の構造と整合させる）。

## アーキテクチャ制約（必ず遵守）

- 入出力スキーマは Zod（`packages/api-contract`）で定義し API 契約として共有する
- `any` 禁止 / default export 禁止 / `===` `!==`
- `unitSchema` は `recipe.schema.ts` から import して再利用（**独自定義しない**）

## 実装対象ファイル

| 種別 | ファイル                                          | 内容                                                                                                           |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 新規 | `packages/api-contract/src/pantry.schema.ts`      | `stockIdParamSchema`/`consumeStockSchema`/`storageLocationSchema`/`stockResponseSchema`/`pantryResponseSchema` |
| 新規 | `packages/api-contract/src/pantry.schema.test.ts` | 契約テスト                                                                                                     |
| 追記 | `packages/api-contract/src/index.ts`              | `export * from './pantry.schema'`                                                                              |

## 1. `pantry.schema.ts`（そのまま実装）

```typescript
import z from 'zod';
import { unitSchema } from './recipe.schema';

export const stockIdParamSchema = z.object({
  stockId: z.uuid(),
});

export const consumeStockSchema = z.object({
  amount: z.object({
    value: z.number().positive(), // D-6: 0 を reject
    unit: unitSchema,
  }),
});

export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry']); // D-2

export const stockResponseSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  displayName: z.string(),
  amount: z.object({ value: z.number(), unit: unitSchema }),
  purchasedAt: z.iso.datetime(),
  expiresAt: z.iso.date().nullable(),
  storedLocation: storageLocationSchema.nullable(),
});

export const pantryResponseSchema = z.object({
  stocks: z.array(stockResponseSchema), // D-7: pantry id は含めない
});

export type StockIdParam = z.infer<typeof stockIdParamSchema>;
export type ConsumeStockBody = z.infer<typeof consumeStockSchema>;
export type StorageLocationSchemaType = z.infer<typeof storageLocationSchema>;
export type StockResponse = z.infer<typeof stockResponseSchema>;
export type PantryResponse = z.infer<typeof pantryResponseSchema>;
```

## 2. `index.ts` 追記（1 行のみ。既存 export の並び・内容は変更しない）

```typescript
export * from './pantry.schema';
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- **discard API・完了 API に新規リクエストスキーマは作らない**:
  - discard はボディなし POST（スキーマ不要）
  - 完了 API（`POST /api/shopping-lists/:id/complete`）は既存 `shoppingListIdParamSchema` と
    `shoppingListResponseSchema` を再利用する
- **`shopping-list.schema.ts` を変更しない**（既存 4 契約ファイルすべて無変更）
- `consumeStockSchema.amount.value` は **`positive()`**（`min(0)` にしない。既存
  `addItemSchema.requiredAmount.value: z.number().min(0)` との**意図的な非対称**。D-6）
- スキーマ名の綴り: `stockIdParamSchema`（param キーは `stockId`）/ `consumeStockSchema` /
  `storageLocationSchema` / `stockResponseSchema` / `pantryResponseSchema`

## テスト（`pantry.schema.test.ts`）

| 対象スキーマ            | 観点                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stockIdParamSchema`    | 正常 uuid を受け入れる／不正な `stockId` を reject                                                                                                                                                                                                             |
| `consumeStockSchema`    | **`amount.value = 0` を reject（D-6。`addItemSchema` との意図的な非対称を明示テスト）**／負数を reject／正数を受け入れる／`amount.unit` が 17 値それぞれを受け入れる（`it.each` 先例）／未知の単位を reject／`amount` キー省略を reject                        |
| `storageLocationSchema` | `'fridge'`/`'freezer'`/`'pantry'` を受け入れる／未知の文字列を reject                                                                                                                                                                                          |
| `stockResponseSchema`   | `productId`/`expiresAt`/`storedLocation` **すべて null** を parse できる／すべて非 null を parse できる／`purchasedAt` が ISO datetime 形式でない場合 reject／`expiresAt` が ISO date 形式でない場合 reject（**datetime 文字列を date として reject** を含む） |
| `pantryResponseSchema`  | `stocks: []` を parse できる（S-1）／複数 Stock 配列を parse できる                                                                                                                                                                                            |

## 完了条件

- [ ] `pnpm --filter @cookpit/api-contract test` 全 green
- [ ] `pnpm --filter @cookpit/api-contract type-check` 通過
- [ ] `pantry.schema.ts` の 5 スキーマが契約書 §1.1 と完全一致
- [ ] `shopping-list.schema.ts` ほか既存契約ファイルに変更がない
- [ ] `consumeStockSchema.amount.value` の 0 reject（D-6）がテストされている
