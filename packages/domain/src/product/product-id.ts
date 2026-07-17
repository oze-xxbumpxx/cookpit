import { Identifier, generateId } from '../shared/identifier';

export class ProductId extends Identifier<'ProductId'> {
  static generate(): ProductId {
    return new ProductId(generateId());
  }

  static fromString(value: string): ProductId {
    return new ProductId(value);
  }
}
