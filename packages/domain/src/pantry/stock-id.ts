import { Identifier, generateId } from '../shared/identifier';

export class StockId extends Identifier<'StockId'> {
  static generate(): StockId {
    return new StockId(generateId());
  }

  static fromString(value: string): StockId {
    return new StockId(value);
  }
}
