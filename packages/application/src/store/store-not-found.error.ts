import { NotFoundError } from '../shared/errors';

export class StoreNotFoundError extends NotFoundError {
  constructor(storeId: string) {
    super('Store', storeId);
  }
}
