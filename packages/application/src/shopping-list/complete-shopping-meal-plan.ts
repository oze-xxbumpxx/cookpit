import type { MealPlanId, MealPlanRepository } from '@cookpit/domain';

export async function repairMealPlanTransition(
  mealPlanId: MealPlanId,
  mealPlanRepository: MealPlanRepository,
): Promise<void> {
  const mealPlan = await mealPlanRepository.findById(mealPlanId);
  if (mealPlan === null) {
    return;
  }
  if (mealPlan.status === 'draft') {
    mealPlan.transitionTo('shopping');
    mealPlan.transitionTo('cooking');
    await mealPlanRepository.save(mealPlan);
    return;
  }
  if (mealPlan.status === 'shopping') {
    mealPlan.transitionTo('cooking');
    await mealPlanRepository.save(mealPlan);
  }
}
