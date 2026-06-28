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

export type CreateStoreBody = z.infer<typeof createStoreSchema>;
export type StoreResponse = z.infer<typeof storeResponseSchema>;
