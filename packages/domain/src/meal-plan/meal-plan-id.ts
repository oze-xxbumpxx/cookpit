import { randomUUID } from 'node:crypto';

export class MealPlanId {
  private constructor(private readonly mealPlanIdValue: string) {}

  static generate(): MealPlanId {
    return new MealPlanId(randomUUID());
  }

  static fromString(value: string): MealPlanId {
    return new MealPlanId(value);
  }

  equals(other: MealPlanId): boolean {
    return this.mealPlanIdValue === other.mealPlanIdValue;
  }

  get value(): string {
    return this.mealPlanIdValue;
  }
}
