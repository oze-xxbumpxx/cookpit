import { Identifier, generateId } from '../shared/identifier';

export class PushSubscriptionId extends Identifier<'PushSubscriptionId'> {
  static generate(): PushSubscriptionId {
    return new PushSubscriptionId(generateId());
  }

  static fromString(value: string): PushSubscriptionId {
    return new PushSubscriptionId(value);
  }
}
