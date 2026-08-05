import type { StoreUnitPriceEntry } from '@/app/shopping-lists/_utils/price-comparison';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreUnitPriceList } from '../../../../src/app/shopping-lists/_components/store-unit-price-list';

function createEntry(overrides: Partial<StoreUnitPriceEntry> = {}): StoreUnitPriceEntry {
  return {
    storeId: 'store-a',
    storeName: '店舗A',
    unitPriceAmount: 298,
    isCheapest: false,
    diffFromCheapestYen: 45,
    ...overrides,
  };
}

describe('StoreUnitPriceList', () => {
  afterEach(() => {
    cleanup();
  });

  it('SUP-01: 最安行に「← 最安」ラベルが表示される', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[createEntry({ isCheapest: true, diffFromCheapestYen: 0 })]}
      />,
    );

    expect(screen.getByText('← 最安')).toBeDefined();
  });

  it('SUP-02: 非最安行に「+{差}円」ラベルが表示される', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[createEntry({ isCheapest: false, diffFromCheapestYen: 45 })]}
      />,
    );

    expect(screen.getByText('+45円')).toBeDefined();
  });

  it('SUP-03: 各行に店舗名 + ${formatYen(unitPriceAmount)} / ${basisLabel} が表示される', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[createEntry({ storeName: 'イオン', unitPriceAmount: 298 })]}
      />,
    );

    expect(screen.getByText('イオン')).toBeDefined();
    expect(screen.getByText('298円 / 100g')).toBeDefined();
  });

  it('SUP-04: 店舗上限ちょうど 3 行渡すと 3 行とも表示される（境界値）', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[
          createEntry({
            storeId: 'store-a',
            storeName: '店舗A',
            isCheapest: true,
            diffFromCheapestYen: 0,
          }),
          createEntry({ storeId: 'store-b', storeName: '店舗B' }),
          createEntry({ storeId: 'store-c', storeName: '店舗C' }),
        ]}
      />,
    );

    expect(screen.getByText('店舗A')).toBeDefined();
    expect(screen.getByText('店舗B')).toBeDefined();
    expect(screen.getByText('店舗C')).toBeDefined();
  });

  it('SUP-05: 通常ケース: 2 行渡すと 2 行のみ表示される', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[
          createEntry({ storeId: 'store-a', storeName: '店舗A' }),
          createEntry({ storeId: 'store-b', storeName: '店舗B' }),
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('SUP-06: 複数行が同額のとき、該当行すべてに「← 最安」が表示される（縮退#9の表示確認）', () => {
    render(
      <StoreUnitPriceList
        basisLabel="100g"
        entries={[
          createEntry({ storeId: 'store-a', isCheapest: true, diffFromCheapestYen: 0 }),
          createEntry({ storeId: 'store-b', isCheapest: true, diffFromCheapestYen: 0 }),
          createEntry({ storeId: 'store-c', isCheapest: true, diffFromCheapestYen: 0 }),
        ]}
      />,
    );

    expect(screen.getAllByText('← 最安')).toHaveLength(3);
  });

  it('SUP-07: 防御性: entries が空配列でも例外を投げない', () => {
    expect(() => render(<StoreUnitPriceList basisLabel="100g" entries={[]} />)).not.toThrow();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
