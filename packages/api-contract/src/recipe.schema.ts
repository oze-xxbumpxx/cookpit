import z from 'zod';

const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});

/** UI で候補として提示するプリセット単位。自由入力も許容する（項目3）。 */
export const UNIT_PRESETS = [
  'g',
  'kg',
  'ml',
  'l',
  '大さじ',
  '小さじ',
  'cup',
  '個',
  '本',
  '枚',
  '玉',
  '尾',
  '切れ',
  '束',
  '袋',
  '缶',
  '合',
] as const;

// 単位は自由記述を許容する（Sprint1 のプリセット固定・型安全優先方針を撤回。項目3）。
// 空文字は拒否、前後空白は除去、最大 20 文字。
export const unitSchema = z.string().trim().min(1).max(20);

export const recipeTagSchema = z.enum(['主菜', '副菜', '汁物', '作り置き向き', '冷凍可']);

export const recipeIngredientSchema = z
  .object({
    productRef: z.string().nullable(),
    displayName: nonBlankString,
    amountValue: z.number().nullable(),
    amountUnit: unitSchema.nullable(),
    amountNote: nonBlankString.nullable(),
  })
  .superRefine((value, ctx) => {
    const hasAmountValue = value.amountValue !== null;
    const hasAmountUnit = value.amountUnit !== null;
    const hasAmountNote = value.amountNote !== null && value.amountNote.trim() !== '';

    if (value.amountNote !== null && value.amountNote.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['amountNote'],
        message: 'amountNote must be non-blank when provided',
      });
    }

    if (hasAmountValue !== hasAmountUnit) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountUnit'],
        message: 'amountValue and amountUnit must be provided together',
      });
    }

    if (hasAmountValue && hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountNote'],
        message: 'amount and amountNote cannot both be set',
      });
    }

    if (!hasAmountValue && !hasAmountNote) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountValue'],
        message: 'Either amount or amountNote is required',
      });
    }
  });

export const cookingStepSchema = z.object({
  description: nonBlankString,
});

export const createRecipeSchema = z.object({
  name: nonBlankString,
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  baseServings: z.number().positive(),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
  servings: z.number().int().positive().nullable().optional(),
});

export const updateRecipeSchema = z.object({
  name: nonBlankString,
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(cookingStepSchema),
  tags: z.array(recipeTagSchema),
  cookingTime: z.number().int().nonnegative().nullable(),
  notes: z.string(),
  servings: z.number().int().positive().nullable().optional(),
});

export type CreateRecipeBody = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeBody = z.infer<typeof updateRecipeSchema>;
