import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import type { MealPlanDto } from './meal-plan.dto';
import { toMealPlanDto } from './meal-plan.mapper';

/**
 * 指定した週の献立を取得する。存在しなければ null を返す。
 *
 * @param weekIdentifier 週の識別子。非土曜の日付は直前の土曜へスナップされる（WeekIdentifier 不変条件）。
 */
export class GetMealPlanByWeekUseCase {
  constructor(private readonly mealPlanRepository: MealPlanRepository) {}

  async execute(weekIdentifier: string): Promise<MealPlanDto | null> {
    const week = WeekIdentifier.fromString(weekIdentifier);
    const mealPlan = await this.mealPlanRepository.findByWeek(week);
    return mealPlan === null ? null : toMealPlanDto(mealPlan);
  }
}
