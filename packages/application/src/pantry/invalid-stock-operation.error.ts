export class InvalidStockOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockOperationError';
  }
}
