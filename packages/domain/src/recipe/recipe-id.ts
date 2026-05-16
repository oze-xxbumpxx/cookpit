import { randomUUID } from 'node:crypto';

export class RecipeId {
  private constructor(private readonly recipeIdValue: string) {}

  static generate(): RecipeId {
    return new RecipeId(randomUUID());
  }

  static fromString(value: string): RecipeId {
    return new RecipeId(value);
  }

  equals(other: RecipeId): boolean {
    return this.recipeIdValue === other.recipeIdValue;
  }

  get value(): string {
    return this.recipeIdValue;
  }
}
