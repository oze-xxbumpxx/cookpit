import z from 'zod';
import { unitSchema } from './recipe.schema';
import { idParamSchema } from './shared.schema';

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

/** 商品 ID と価格記録 ID の 2 つを持つパスパラメータ（`/products/:id/price-records/:priceRecordId`）。 */
export const priceRecordIdParamSchema = idParamSchema.extend({
  priceRecordId: z.uuid(),
});

export type ProductCategory = z.infer<typeof productCategorySchema>;
export type PriceRecordIdParam = z.infer<typeof priceRecordIdParamSchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type RecordPriceBody = z.infer<typeof recordPriceSchema>;
