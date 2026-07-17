import { Identifier, generateId } from '../shared/identifier';

export class PlannedRecipeId extends Identifier {
  static generate(): PlannedRecipeId {
    return new PlannedRecipeId(generateId());
  }

  static fromString(value: string): PlannedRecipeId {
    return new PlannedRecipeId(value);
  }
}
