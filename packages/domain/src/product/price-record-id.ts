import { Identifier, generateId } from '../shared/identifier';

export class PriceRecordId extends Identifier<'PriceRecordId'> {
  static generate(): PriceRecordId {
    return new PriceRecordId(generateId());
  }

  static fromString(value: string): PriceRecordId {
    return new PriceRecordId(value);
  }
}
