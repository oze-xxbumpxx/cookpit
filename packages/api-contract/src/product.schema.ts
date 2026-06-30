import z from 'zod';
import { unitSchema } from './recipe.schema';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

export const productCategorySchema = z.enum([
  '野菜',
  '肉',
  '魚',
  '調味料',
  '乾物',
  '冷凍',
  'その他',
]);

export const createProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

export const updateProductSchema = z.object({
  name: nonBlankString,
  aliases: z.array(z.string()),
  category: productCategorySchema,
  defaultUnit: unitSchema,
});

export const recordPriceSchema = z.object({
  storeId: z.uuid(),
  priceAmount: z.number().positive(),
  packageSizeValue: z.number().positive(),
  packageSizeUnit: unitSchema,
});

export type ProductCategory = z.infer<typeof productCategorySchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type RecordPriceBody = z.infer<typeof recordPriceSchema>;
