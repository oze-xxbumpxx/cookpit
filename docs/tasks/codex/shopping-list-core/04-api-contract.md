# Task 4: API Contract 層 — Zod スキーマ + 契約テスト

## 概要

`packages/api-contract` に `shopping-list.schema.ts`（Zod スキーマ一式）と契約テストを新規作成する。
**模範コード**: `packages/api-contract/src/meal-plan.schema.ts` + `meal-plan.schema.test.ts`。
Vitest は導入済み（追加設定不要）。

依存: なし（型のみの独立実装。Task 3 の DTO 構造と整合させるが、パッケージ依存はない）。

## アーキテクチャ制約（必ず遵守）

- 入出力スキーマは Zod で定義し API 契約として共有する（`packages/api-contract`）
- `any` 禁止 / default export 禁止 / 型のみは `import type` / `===` `!==`
- 公開エクスポートのうち、型・Zod スキーマに表せない契約情報（フォーマット・不変条件・
  冪等性など）がある場合のみ JSDoc を付ける（coding-standards.md 2026-07-12 改定。
  型の言い換えは書かない）
- 既存スキーマファイル（`recipe.schema.ts`/`product.schema.ts`/`store.schema.ts`/
  `meal-plan.schema.ts`）は**一切変更しない**

## 実装対象ファイル

| 種別 | ファイル                                                 | 内容                                     |
| ---- | -------------------------------------------------------- | ---------------------------------------- |
| 新規 | `packages/api-contract/src/shopping-list.schema.ts`      | Zod スキーマ一式                         |
| 新規 | `packages/api-contract/src/shopping-list.schema.test.ts` | 契約テスト                               |
| 追記 | `packages/api-contract/src/index.ts`                     | `export * from './shopping-list.schema'` |

## 1. `shopping-list.schema.ts`（契約確定仕様からの転記。そのまま実装）

```typescript
import z from 'zod';
import { unitSchema } from './recipe.schema';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

// 1. Generate
export const generateShoppingListSchema = z.object({
  mealPlanId: z.uuid(),
});

// 2. AddItem
export const addItemSchema = z.object({
  displayName: nonBlankString,
  requiredAmount: z.object({
    value: z.number().min(0),
    unit: unitSchema,
  }),
  productId: z.uuid().nullable(),
  targetStoreId: z.uuid().nullable(),
});

// 3. MarkAsBought
export const markAsBoughtSchema = z.object({
  actualPrice: z.object({
    amount: z.number().min(0),
    currency: z.literal('JPY'),
  }),
  actualStoreId: z.uuid(),
});

// 4. ReassignStore
export const reassignStoreSchema = z.object({
  targetStoreId: z.uuid(),
});

// 5. param
export const shoppingListIdParamSchema = z.object({
  id: z.uuid(),
});

export const shoppingItemIdParamSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
});

// 6. response
export const itemStatusSchema = z.enum(['pending', 'bought', 'skipped']);
export const itemSourceSchema = z.enum(['from_meal_plan', 'manually_added']);
export const shoppingListStatusSchema = z.enum(['active', 'completed']);

export const shoppingItemResponseSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid().nullable(),
    displayName: z.string(),
    requiredAmount: z.object({ value: z.number(), unit: unitSchema }).nullable(),
    amountNote: z.string().nullable(),
    targetStoreId: z.uuid().nullable(),
    status: itemStatusSchema,
    actualPrice: z.object({ amount: z.number(), currency: z.literal('JPY') }).nullable(),
    actualStoreId: z.uuid().nullable(),
    source: itemSourceSchema,
  })
  .superRefine((value, ctx) => {
    const hasRequiredAmount = value.requiredAmount !== null;
    const hasAmountNote = value.amountNote !== null;
    if (hasRequiredAmount === hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['requiredAmount'],
        message: 'Exactly one of requiredAmount or amountNote must be set',
      });
    }
  });

export const shoppingListResponseSchema = z.object({
  id: z.uuid(),
  mealPlanId: z.uuid(),
  shoppingDate: z.iso.date(),
  status: shoppingListStatusSchema,
  items: z.array(shoppingItemResponseSchema),
  createdAt: z.iso.datetime(),
});

export type GenerateShoppingListBody = z.infer<typeof generateShoppingListSchema>;
export type AddItemBody = z.infer<typeof addItemSchema>;
export type MarkAsBoughtBody = z.infer<typeof markAsBoughtSchema>;
export type ReassignStoreBody = z.infer<typeof reassignStoreSchema>;
export type ShoppingListIdParam = z.infer<typeof shoppingListIdParamSchema>;
export type ShoppingItemIdParam = z.infer<typeof shoppingItemIdParamSchema>;
export type ItemStatusSchemaType = z.infer<typeof itemStatusSchema>;
export type ItemSourceSchemaType = z.infer<typeof itemSourceSchema>;
export type ShoppingListStatusSchemaType = z.infer<typeof shoppingListStatusSchema>;
export type ShoppingItemResponse = z.infer<typeof shoppingItemResponseSchema>;
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;
```

## 2. `index.ts` 追記（1 行のみ）

```typescript
export * from './shopping-list.schema';
```

## 厳守事項（違反すると build/ESM エラーまたは契約不整合）

- `unitSchema` は新規列挙**せず** `import { unitSchema } from './recipe.schema'` で再利用する
- **`errorResponseSchema` は本ファイルに再定義しない**。`meal-plan.schema.ts` が既にエクスポート
  済みで、`index.ts` は両ファイルを `export *` するため、2 箇所でエクスポートすると ESM の
  名前衝突になる。必要なら `import { errorResponseSchema } from './meal-plan.schema'`
  （本ファイル内で使わないなら import 自体不要）
- `requiredAmount.value`/`actualPrice.amount` は `z.number().min(0)`（**0 以上**。`.positive()` に
  しない。`Quantity.of`/`Money.of` の非負検証と一致させる）。
  **`actualPrice.amount` の `.min(0)` は削除・緩和禁止**: Task 3 レビューで
  `MarkAsBoughtUseCase` の catch が try 内で評価される `Money.of`（負値で throw）の例外を
  `ShoppingItemNotFoundError` に誤変換する潜在バグが判明しており
  （`docs/claude-code/improvements/candidates/shopping-list-core.md` 事象 2）、負値をこの
  スキーマで reject することが現状唯一のガード（Task 5 のルートが本スキーマを
  `zValidator` で通す前提）
- `actualPrice.currency` は `z.literal('JPY')` 固定
- `addItemSchema` の `productId`/`targetStoreId` は `.nullable()` **のみ**（`.optional()` を
  付けない。キー省略は reject・`null` の明示のみ許容）

## 命名・記法の注意（過去の Codex ミス実績への先回り）

- スキーマ名の綴りを正確に: `generateShoppingListSchema` / `addItemSchema` / `markAsBoughtSchema` /
  `reassignStoreSchema` / `shoppingListIdParamSchema` / `shoppingItemIdParamSchema` /
  `shoppingItemResponseSchema` / `shoppingListResponseSchema`
- `superRefine` の判定は `hasRequiredAmount === hasAmountNote` で reject（排他 XOR）。
  エラーメッセージ文字列は上記のとおり正確に

## テスト（`shopping-list.schema.test.ts`）

- `generateShoppingListSchema`: 正常な `mealPlanId` の parse 通過／不正 UUID の reject
- `addItemSchema`: `displayName` 空文字・空白のみ reject／`requiredAmount.value` 境界
  （`0` accept・負数 reject）／`requiredAmount.unit` の 17 値 enum 外 reject／
  `productId`/`targetStoreId` の `null` accept・キー省略（`undefined`）reject
- `markAsBoughtSchema`: `actualPrice.amount` 境界（`0` accept・負数 reject）／
  `actualPrice.currency` が `'JPY'` 以外（例 `'USD'`）で reject／`actualStoreId` 不正 UUID reject
- `reassignStoreSchema`: `targetStoreId` 不正 UUID reject
- param スキーマ: `id`/`itemId` 不正 UUID reject
- `shoppingItemResponseSchema`: `requiredAmount`/`amountNote` **両方 null または両方非 null で
  reject**（superRefine。S-5 の最重要契約テスト）／どちらか一方のみ非 null で accept（2 パターン）／
  `productId`/`targetStoreId`/`actualPrice`/`actualStoreId` の null・非 null 両パターン
- `shoppingListResponseSchema`: Task 3 Mapper の実出力相当のオブジェクトが `.parse()` を通過する
  型往復テスト（items 0 件の空配列ケースを含む）

## 完了条件

- [ ] `pnpm --filter @cookpit/api-contract test` 全 green
- [ ] `pnpm --filter @cookpit/api-contract type-check` 通過
- [ ] `pnpm lint` 通過
- [ ] `errorResponseSchema` が再定義されていない
- [ ] 既存 `recipe.schema.ts`/`product.schema.ts`/`store.schema.ts`/`meal-plan.schema.ts` に
      変更がない（既存 `.test.ts` が green のまま）
