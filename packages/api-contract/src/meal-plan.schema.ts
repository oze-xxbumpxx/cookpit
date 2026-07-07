import z from 'zod';

export const createMealPlanSchema = z.object({
  weekIdentifier: z.iso.date(),
});

export const addRecipeToMealPlanSchema = z.object({
  recipeId: z.uuid(),
  scaleFactor: z.number().positive(),
});

export const mealPlanIdParamSchema = z.object({
  id: z.uuid(),
});

export const plannedRecipeIdParamSchema = z.object({
  id: z.uuid(),
  plannedRecipeId: z.uuid(),
});

export const getMealPlanHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export const mealPlanStatusSchema = z.enum([
  'draft',
  'shopping',
  'cooking',
  'consuming',
  'completed',
]);

export const plannedRecipeResponseSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  scaleFactor: z.number(),
  scheduledDate: z.iso.date().nullable(),
  cookedAt: z.iso.datetime().nullable(),
  notes: z.string(),
});

export const mealPlanResponseSchema = z.object({
  id: z.uuid(),
  weekIdentifier: z.iso.date(),
  status: mealPlanStatusSchema,
  plannedRecipes: z.array(plannedRecipeResponseSchema),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const getCurrentMealPlanResponseSchema = z.object({
  data: mealPlanResponseSchema.nullable(),
});

export const mealPlanHistoryResponseSchema = z.array(mealPlanResponseSchema);

export const errorResponseSchema = z.object({
  error: z.string(),
});

export type CreateMealPlanBody = z.infer<typeof createMealPlanSchema>;
export type AddRecipeToMealPlanBody = z.infer<typeof addRecipeToMealPlanSchema>;
export type MealPlanIdParam = z.infer<typeof mealPlanIdParamSchema>;
export type PlannedRecipeIdParam = z.infer<typeof plannedRecipeIdParamSchema>;
export type GetMealPlanHistoryQuery = z.infer<typeof getMealPlanHistoryQuerySchema>;
export type MealPlanStatusSchemaType = z.infer<typeof mealPlanStatusSchema>;
export type PlannedRecipeResponse = z.infer<typeof plannedRecipeResponseSchema>;
export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
export type GetCurrentMealPlanResponse = z.infer<typeof getCurrentMealPlanResponseSchema>;
export type MealPlanHistoryResponse = z.infer<typeof mealPlanHistoryResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
