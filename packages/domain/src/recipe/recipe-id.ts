import { Identifier, generateId } from '../shared/identifier';

export class RecipeId extends Identifier<'RecipeId'> {
  static generate(): RecipeId {
    return new RecipeId(generateId());
  }

  static fromString(value: string): RecipeId {
    return new RecipeId(value);
  }
}
