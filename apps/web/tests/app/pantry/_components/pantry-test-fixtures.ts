import type { StockDto } from '@cookpit/application';

/** パントリ画面のテストが共有する StockDto ファクトリ。 */
export function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    productId: null,
    displayName: '牛乳',
    amount: { value: 1000, unit: 'ml' },
    purchasedAt: '2026-07-11T01:00:00.000Z',
    expiresAt: null,
    storedLocation: null,
    ...overrides,
  };
}
