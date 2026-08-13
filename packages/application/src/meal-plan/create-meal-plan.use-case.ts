import { MealPlan, WeekIdentifier } from '@cookpit/domain';
import type { UnitOfWork, MealPlanRepository } from '@cookpit/domain';
import type { CreateMealPlanInputDto, MealPlanDto } from './meal-plan.dto';
import { toMealPlanDto } from './meal-plan.mapper';

export class CreateMealPlanUseCase {
  constructor(
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: CreateMealPlanInputDto): Promise<MealPlanDto> {
    return this.unitOfWork.execute(async () => {
      const weekIdentifier = WeekIdentifier.fromString(input.weekIdentifier);
      const existing = await this.mealPlanRepository.findByWeek(weekIdentifier);
      if (existing !== null) {
        return toMealPlanDto(existing);
      }

      const mealPlan = MealPlan.create(weekIdentifier);
      await this.mealPlanRepository.save(mealPlan);

      return toMealPlanDto(mealPlan);
    });
  }
}
