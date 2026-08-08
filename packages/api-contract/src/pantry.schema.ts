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

export const addStockSchema = z.object({
  displayName: z.string().min(1),
  amount: z.object({
    value: z.number().positive(),
    unit: unitSchema,
  }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});

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
export type AddStockBody = z.infer<typeof addStockSchema>;
export type UpdateStockBody = z.infer<typeof updateStockSchema>;
export type StorageLocationSchemaType = z.infer<typeof storageLocationSchema>;
export type StockResponse = z.infer<typeof stockResponseSchema>;
export type PantryResponse = z.infer<typeof pantryResponseSchema>;
