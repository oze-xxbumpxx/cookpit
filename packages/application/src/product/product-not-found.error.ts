import { NotFoundError } from '../shared/errors';

export class ProductNotFoundError extends NotFoundError {
  constructor(productId: string) {
    super('Product', productId);
  }
}
