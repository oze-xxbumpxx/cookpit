import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import type { GetMealPlanHistoryInputDto, MealPlanDto } from './meal-plan.dto';
import { toMealPlanDto } from './meal-plan.mapper';

export class GetMealPlanHistoryUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(input: GetMealPlanHistoryInputDto): Promise<MealPlanDto[]> {
    const limit = input.limit ?? 4;
    const mealPlans = await this.mealPlanRepository.findRecent(limit);

    return mealPlans.map(toMealPlanDto);
  }
}
