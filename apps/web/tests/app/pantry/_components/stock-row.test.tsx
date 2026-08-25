import type { StockDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockRow } from '../../../../src/app/pantry/_components/stock-row';

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
    asOf: new Date('2026-08-08T09:00:00'),
    submitting: false,
    onEdit: vi.fn(),
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

  it('SR-04: 「消費」click で onConsume に stock.id が渡される', async () => {
    const user = userEvent.setup();
    const onConsume = vi.fn();
    const stock = createStockDto({ id: '10000000-0000-4000-8000-000000000004' });
    renderRow({ stock, onConsume });

    await user.click(screen.getByRole('button', { name: '消費' }));

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

    expect(screen.getByRole('button', { name: '消費' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '廃棄' }).hasAttribute('disabled')).toBe(true);
  });

  it('SR-07: 確認 UI を挟まず各コールバックが即座に呼ばれる', async () => {
    const user = userEvent.setup();
    const onConsume = vi.fn();
    const onDiscard = vi.fn();
    renderRow({ onConsume, onDiscard });

    await user.click(screen.getByRole('button', { name: '消費' }));
    await user.click(screen.getByRole('button', { name: '廃棄' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('SR-EDIT-01: 保存場所ラベルを常時表示する', () => {
    renderRow({ stock: createStockDto({ storedLocation: 'fridge' }) });
    expect(screen.getByText('保存場所: 冷蔵')).toBeDefined();
  });

  it('SR-EDIT-02: 保存場所が null でも未設定ラベルを表示する', () => {
    renderRow({ stock: createStockDto({ storedLocation: null }) });
    expect(screen.getByText('保存場所: 保存場所未設定')).toBeDefined();
  });

  it('SR-EDIT-06: 編集ボタンで onEdit に stock を渡す', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const stock = createStockDto({ id: '10000000-0000-4000-8000-000000000008' });
    renderRow({ stock, onEdit });

    await user.click(screen.getByRole('button', { name: '編集' }));

    expect(onEdit).toHaveBeenCalledWith(stock);
  });

  it('SR-EDIT-03: 閾値内の賞味期限に緊急度チップを表示する', () => {
    renderRow({ stock: createStockDto({ expiresAt: '2026-08-10' }) });

    expect(screen.getByText('あと2日')).toBeDefined();
  });

  it('SR-EDIT-04: 閾値外の賞味期限には緊急度チップを表示しない', () => {
    renderRow({ stock: createStockDto({ expiresAt: '2026-08-18' }) });

    expect(screen.queryByText('あと10日')).toBeNull();
  });

  it('SR-EDIT-05: 賞味期限が null なら緊急度チップを表示しない', () => {
    renderRow({ stock: createStockDto({ expiresAt: null }) });

    expect(screen.queryByText(/期限切れ|本日まで|明日まで|あと\d+日/)).toBeNull();
  });

  it('SR-EDIT-BND: 閾値ちょうど3日では表示し、4日では表示しない', () => {
    renderRow({ stock: createStockDto({ expiresAt: '2026-08-11' }) });
    expect(screen.getByText('あと3日')).toBeDefined();
    cleanup();

    renderRow({ stock: createStockDto({ expiresAt: '2026-08-12' }) });
    expect(screen.queryByText('あと4日')).toBeNull();
  });

  it('SR-EDIT-07: 期限切れの在庫に「期限切れ」チップを表示する', () => {
    renderRow({ stock: createStockDto({ expiresAt: '2026-08-07' }) });

    expect(screen.getByText('期限切れ')).toBeDefined();
  });

  it('SR-DEEP-01: highlighted のとき border-primary / ring を付ける', () => {
    const stock = createStockDto({ id: '10000000-0000-4000-8000-000000000009' });
    renderRow({ stock, highlighted: true });

    const row = document.getElementById(`stock-${stock.id}`);
    expect(row).not.toBeNull();
    expect(row?.className).toContain('border-primary');
    expect(row?.className).toContain('ring-2');
  });
});
