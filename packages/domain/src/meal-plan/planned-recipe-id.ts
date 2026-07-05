import { randomUUID } from 'node:crypto';

export class PlannedRecipeId {
  private constructor(private readonly plannedRecipeIdValue: string) {}

  static generate(): PlannedRecipeId {
    return new PlannedRecipeId(randomUUID());
  }

  static fromString(value: string): PlannedRecipeId {
    return new PlannedRecipeId(value);
  }

  equals(other: PlannedRecipeId): boolean {
    return this.plannedRecipeIdValue === other.plannedRecipeIdValue;
  }

  get value(): string {
    return this.plannedRecipeIdValue;
  }
}
