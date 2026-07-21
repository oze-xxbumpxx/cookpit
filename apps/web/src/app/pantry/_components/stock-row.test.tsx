import type { StockDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockRow } from './stock-row';

function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
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

function renderRow(props: Partial<Parameters<typeof StockRow>[0]> = {}) {
  const defaults = {
    stock: createStockDto(),
    submitting: false,
    onConsume: vi.fn(),
    onDiscard: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  render(<ul>{<StockRow {...merged} />}</ul>);
  return merged;
}

describe('StockRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SR-01: displayName と数量が表示される', () => {
    renderRow({
      stock: createStockDto({ displayName: '牛乳', amount: { value: 1000, unit: 'ml' } }),
    });

    expect(screen.getByText('牛乳')).toBeDefined();
    expect(screen.getByText('1000ml')).toBeDefined();
  });

  it('SR-02: expiresAt があるとき賞味期限が併記される', () => {
    renderRow({ stock: createStockDto({ expiresAt: '2026-08-01' }) });

    expect(screen.getByText('〜8/1まで')).toBeDefined();
  });

  it('SR-03: expiresAt が null のとき賞味期限は表示されない', () => {
    renderRow({ stock: createStockDto({ expiresAt: null }) });

    expect(screen.queryByText(/〜.*まで/)).toBeNull();
  });

  it('SR-04: 「使った」click で onConsume に stock.id が渡される', async () => {
    const user = userEvent.setup();
    const onConsume = vi.fn();
    const stock = createStockDto({ id: '10000000-0000-4000-8000-000000000004' });
    renderRow({ stock, onConsume });

    await user.click(screen.getByRole('button', { name: '使った' }));

    expect(onConsume).toHaveBeenCalledWith(stock.id);
  });

  it('SR-05: 「廃棄」click で onDiscard に stock.id が渡される', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const stock = createStockDto({ id: '10000000-0000-4000-8000-000000000005' });
    renderRow({ stock, onDiscard });

    await user.click(screen.getByRole('button', { name: '廃棄' }));

    expect(onDiscard).toHaveBeenCalledWith(stock.id);
  });

  it('SR-06: submitting 中は両ボタンが disabled になる', () => {
    renderRow({ submitting: true });

    expect(screen.getByRole('button', { name: '使った' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '廃棄' }).hasAttribute('disabled')).toBe(true);
  });

  it('SR-07: 確認 UI を挟まず各コールバックが即座に呼ばれる', async () => {
    const user = userEvent.setup();
    const onConsume = vi.fn();
    const onDiscard = vi.fn();
    renderRow({ onConsume, onDiscard });

    await user.click(screen.getByRole('button', { name: '使った' }));
    await user.click(screen.getByRole('button', { name: '廃棄' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
