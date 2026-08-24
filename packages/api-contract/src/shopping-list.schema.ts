import z from 'zod';
import { storageLocationSchema } from './pantry.schema';
import { unitSchema } from './recipe.schema';
import { idParamSchema } from './shared.schema';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

export const generateShoppingListSchema = z.object({
  mealPlanId: z.uuid(),
});

export const addItemSchema = z.object({
  displayName: nonBlankString,
  requiredAmount: z.object({
    value: z.number().min(0),
    unit: unitSchema,
  }),
  productId: z.uuid().nullable(),
  targetStoreId: z.uuid().nullable(),
});

export const markAsBoughtSchema = z.object({
  actualPrice: z.object({
    amount: z.number().min(0),
    currency: z.literal('JPY'),
  }),
  actualStoreId: z.uuid(),
});

export const reassignStoreSchema = z.object({
  targetStoreId: z.uuid(),
});

export const setItemCheckedSchema = z.object({
  checked: z.boolean(),
});

/**
 * 買い物完了時に在庫へ追加する 1 品目の指定。`itemId` はそのリストの bought 品目でなければならない。
 * `amount` は買い物リストの数量を初期値に UI で修正できるため、リスト側の値とは一致しない。
 */
export const stockAdditionSchema = z.object({
  itemId: z.uuid(),
  // Stock.create が 0 以下を拒否する不変条件に合わせ、契約段階で落とす。
  amount: z.object({
    value: z.number().positive(),
    unit: unitSchema,
  }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});

/** `stockAdditions` は必須。在庫へ追加しない場合も空配列を明示的に送る。 */
export const completeShoppingSchema = z.object({
  stockAdditions: z.array(stockAdditionSchema),
});

export const shoppingListIdParamSchema = idParamSchema;

export const shoppingItemIdParamSchema = idParamSchema.extend({
  itemId: z.uuid(),
});

export const itemStatusSchema = z.enum(['pending', 'bought', 'skipped']);
export const itemSourceSchema = z.enum(['from_meal_plan', 'manually_added']);
export const shoppingListStatusSchema = z.enum(['active', 'completed']);

const quantityResponseSchema = z.object({
  value: z.number(),
  unit: unitSchema,
});

export const coveredIngredientResponseSchema = z.object({
  displayName: z.string(),
  productId: z.uuid(),
  requiredAmount: quantityResponseSchema,
  coveredAmount: quantityResponseSchema,
});

export const shoppingItemResponseSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid().nullable(),
    displayName: z.string(),
    requiredAmount: quantityResponseSchema.nullable(),
    amountNote: z.string().nullable(),
    targetStoreId: z.uuid().nullable(),
    status: itemStatusSchema,
    actualPrice: z.object({ amount: z.number(), currency: z.literal('JPY') }).nullable(),
    actualStoreId: z.uuid().nullable(),
    source: itemSourceSchema,
    // キー欠落はレガシー応答。段階ロールアウト中も parse できるように default null。
    pantryDeductedAmount: quantityResponseSchema.nullable().default(null),
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
  coveredIngredients: z.array(coveredIngredientResponseSchema).nullable().default(null),
  createdAt: z.iso.datetime(),
});

export type GenerateShoppingListBody = z.infer<typeof generateShoppingListSchema>;
export type AddItemBody = z.infer<typeof addItemSchema>;
export type MarkAsBoughtBody = z.infer<typeof markAsBoughtSchema>;
export type SetItemCheckedBody = z.infer<typeof setItemCheckedSchema>;
export type StockAdditionBody = z.infer<typeof stockAdditionSchema>;
export type CompleteShoppingBody = z.infer<typeof completeShoppingSchema>;
export type ReassignStoreBody = z.infer<typeof reassignStoreSchema>;
export type ShoppingListIdParam = z.infer<typeof shoppingListIdParamSchema>;
export type ShoppingItemIdParam = z.infer<typeof shoppingItemIdParamSchema>;
export type ItemStatusSchemaType = z.infer<typeof itemStatusSchema>;
export type ItemSourceSchemaType = z.infer<typeof itemSourceSchema>;
export type ShoppingListStatusSchemaType = z.infer<typeof shoppingListStatusSchema>;
export type ShoppingItemResponse = z.infer<typeof shoppingItemResponseSchema>;
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;
export type CoveredIngredientResponse = z.infer<typeof coveredIngredientResponseSchema>;
