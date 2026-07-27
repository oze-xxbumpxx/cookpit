import { NotFoundError } from '../shared/errors';

export class PriceRecordNotFoundError extends NotFoundError {
  constructor(priceRecordId: string) {
    super('PriceRecord', priceRecordId);
  }
}
