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

/**
 * 価格・内容量の上限は DB の numeric 精度に合わせる
 * （`price_amount` / `unit_price_amount` = numeric(10,1) → 999,999,999.9、
 * `package_size_value` = numeric(10,3) → 9,999,999.999）。
 * 上限が無いと検証を通った値が Postgres 22003 を起こし、素の Error として 500 になる。
 */
const priceAmountSchema = z.number().positive().max(999_999_999);
const packageSizeValueSchema = z.number().positive().max(9_999_999);

export const recordPriceSchema = z.object({
  storeId: z.uuid(),
  priceAmount: priceAmountSchema,
  packageSizeValue: packageSizeValueSchema,
  packageSizeUnit: unitSchema,
});

// 価格記録更新リクエストボディ。recordPriceSchema と同形だが、意図的に別スキーマとして
// 複製する（契約設計書 §2.1: createProductSchema/updateProductSchema の前例と同じ判断）。
// id・priceRecordId は URL param（priceRecordIdParamSchema）由来のため body に含めない。
// observedAt は編集対象外（D-1）のためフィールド自体が存在しない。
export const updatePriceRecordSchema = z.object({
  storeId: z.uuid(),
  priceAmount: priceAmountSchema,
  packageSizeValue: packageSizeValueSchema,
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
export type UpdatePriceRecordBody = z.infer<typeof updatePriceRecordSchema>;
