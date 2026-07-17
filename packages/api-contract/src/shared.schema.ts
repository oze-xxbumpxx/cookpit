import z from 'zod';

/** UUID の `id` パスパラメータを検証する共通スキーマ。 */
export const idParamSchema = z.object({
  id: z.uuid(),
});

export type IdParam = z.infer<typeof idParamSchema>;
