import { Identifier, generateId } from '../shared/identifier';

export class MealPlanId extends Identifier {
  static generate(): MealPlanId {
    return new MealPlanId(generateId());
  }

  static fromString(value: string): MealPlanId {
    return new MealPlanId(value);
  }
}
