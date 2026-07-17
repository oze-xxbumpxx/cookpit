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
