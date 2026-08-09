import type { StockDto, StorageLocation } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationGroup } from '../../../../src/app/pantry/_components/location-group';

function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    productId: null,
    displayName: '牛乳',
    amount: { value: 1000, unit: 'ml' },
    purchasedAt: '2026-07-11T01:00:00.000Z',
    expiresAt: null,
    storedLocation: null,
    ...overrides,
  };
}

function renderLocationGroup(props: Partial<Parameters<typeof LocationGroup>[0]> = {}) {
  const defaults = {
    location: null,
    stocks: [createStockDto()],
    asOf: new Date('2026-08-08T09:00:00'),
    submittingStockId: null,
    onEdit: vi.fn(),
    onConsume: vi.fn(),
    onDiscard: vi.fn(),
  };
  render(<LocationGroup {...defaults} {...props} />);
}

describe('LocationGroup', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('LG-01: location 4 パターンのヘッダーを固定ラベルで表示する', () => {
    const cases: [StorageLocation | null, string][] = [
      ['fridge', '冷蔵'],
      ['freezer', '冷凍'],
      ['pantry', '常温'],
      [null, '保存場所未設定'],
    ];

    for (const [location, label] of cases) {
      const { unmount } = render(
        <LocationGroup
          location={location}
          stocks={[]}
          asOf={new Date('2026-08-08T09:00:00')}
          submittingStockId={null}
          onEdit={vi.fn()}
          onConsume={vi.fn()}
          onDiscard={vi.fn()}
        />,
      );
      expect(screen.getByRole('heading', { name: label })).toBeDefined();
      unmount();
    }
  });

  it('LG-02: stocks 3 件を StockRow 3 件として展開する', () => {
    renderLocationGroup({
      stocks: [
        createStockDto({ id: '20000000-0000-4000-8000-000000000002' }),
        createStockDto({ id: '20000000-0000-4000-8000-000000000003' }),
        createStockDto({ id: '20000000-0000-4000-8000-000000000004' }),
      ],
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('LG-03: stocks が空でも例外なくヘッダーのみ表示する', () => {
    renderLocationGroup({ location: 'fridge', stocks: [] });

    expect(screen.getByRole('heading', { name: '冷蔵' })).toBeDefined();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
