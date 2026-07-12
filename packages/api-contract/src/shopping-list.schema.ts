import z from 'zod';
import { unitSchema } from './recipe.schema';

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

export const shoppingListIdParamSchema = z.object({
  id: z.uuid(),
});

export const shoppingItemIdParamSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
});

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
