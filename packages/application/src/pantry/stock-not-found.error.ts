export class StockNotFoundError extends Error {
  constructor(stockId: string) {
    super(`Stock not found: ${stockId}`);
    this.name = 'StockNotFoundError';
  }
}
