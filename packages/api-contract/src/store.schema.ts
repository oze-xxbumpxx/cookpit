import z from 'zod';

const nonBlankString = z
  .string()
  .max(255)
  .refine((value) => value.trim() !== '', { message: 'required' });

export const createStoreSchema = z.object({
  name: nonBlankString,
});

export const storeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export const storeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

/**
 * 店舗を削除したときに影響を受けるデータの件数（ADR-0013）。削除確認ダイアログの表示専用。
 * どちらも 0 以上の整数。
 */
export const storeUsageResponseSchema = z.object({
  priceRecordCount: z.int().nonnegative(),
  shoppingItemCount: z.int().nonnegative(),
});

export type CreateStoreBody = z.infer<typeof createStoreSchema>;
export type StoreResponse = z.infer<typeof storeResponseSchema>;
export type StoreSchemaType = z.infer<typeof storeSchema>;
export type StoreUsageResponse = z.infer<typeof storeUsageResponseSchema>;
