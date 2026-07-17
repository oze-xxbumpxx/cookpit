import { Identifier, generateId } from '../shared/identifier';

export class RecipeId extends Identifier {
  static generate(): RecipeId {
    return new RecipeId(generateId());
  }

  static fromString(value: string): RecipeId {
    return new RecipeId(value);
  }
}
