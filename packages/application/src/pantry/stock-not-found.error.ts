import { NotFoundError } from '../shared/errors';

export class StockNotFoundError extends NotFoundError {
  constructor(stockId: string) {
    super('Stock', stockId);
  }
}
