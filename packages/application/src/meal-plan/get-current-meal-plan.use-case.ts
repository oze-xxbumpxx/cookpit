import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import type { MealPlanDto } from './meal-plan.dto';
import { toMealPlanDto } from './meal-plan.mapper';

export class GetCurrentMealPlanUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(asOf?: Date): Promise<MealPlanDto | null> {
    const weekIdentifier = WeekIdentifier.fromDate(asOf ?? new Date());
    const mealPlan = await this.mealPlanRepository.findByWeek(weekIdentifier);

    return mealPlan === null ? null : toMealPlanDto(mealPlan);
  }
}
