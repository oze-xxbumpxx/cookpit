import type { StockDto } from '@cookpit/application';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStockDto } from './pantry-test-fixtures';

const { putStock } = vi.hoisted(() => ({
  putStock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      pantry: {
        stocks: {
          ':stockId': { $put: (...args: unknown[]) => putStock(...args) },
        },
      },
    },
  },
}));

import { StockEditDialog } from '../../../../src/app/pantry/_components/stock-edit-dialog';

function createStock(overrides: Partial<StockDto> = {}): StockDto {
  return createStockDto({
    id: '40000000-0000-4000-8000-000000000001',
    displayName: '卵',
    amount: { value: 2, unit: '個' },
    purchasedAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-20',
    storedLocation: 'fridge',
    ...overrides,
  });
}

describe('StockEditDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SED-01: 対象 stock の3項目を初期値として投入する', async () => {
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('数量') as HTMLInputElement).value).toBe('2個');
    });
    expect(screen.getByRole('combobox', { name: '保存場所' }).textContent).toContain('冷蔵');
    expect((screen.getByLabelText('賞味期限') as HTMLInputElement).value).toBe('2026-08-20');
  });

  it('SED-02: 対象 stock が切り替わると初期値を再投入する', async () => {
    const { rerender } = render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');

    rerender(
      <StockEditDialog
        stock={createStock({
          id: '40000000-0000-4000-8000-000000000002',
          amount: { value: 500, unit: 'g' },
          storedLocation: 'freezer',
          expiresAt: null,
        })}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue('500g')).toBeDefined();
    expect(screen.getByRole('combobox', { name: '保存場所' }).textContent).toContain('冷凍');
    expect((screen.getByLabelText('賞味期限') as HTMLInputElement).value).toBe('');
  });

  it('SED-03: 保存時に stockId と3項目の PUT ボディを送る', async () => {
    const user = userEvent.setup();
    const stock = createStock();
    putStock.mockResolvedValue({ ok: true });
    render(
      <StockEditDialog
        stock={stock}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(putStock).toHaveBeenCalledWith({
      param: { stockId: stock.id },
      json: {
        amount: { value: 2, unit: '個' },
        storedLocation: 'fridge',
        expiresAt: '2026-08-20',
      },
    });
  });

  it('SED-04: 成功時に更新後の stocks を onUpdated へ渡してダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onUpdated = vi.fn();
    const updatedStocks = [createStock({ amount: { value: 9, unit: '個' } })];
    putStock.mockResolvedValue({ ok: true, json: async () => ({ stocks: updatedStocks }) });
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={onOpenChange}
        onUpdated={onUpdated}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    // PantryClient は stocks を自前の state で持つため、応答の stocks を返さないと
    // 一覧が更新されない（router.refresh() では props が変わっても state は変わらない）。
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedStocks));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('SED-05: 404 で onStockMissing を呼び、ダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onStockMissing = vi.fn();
    putStock.mockResolvedValue({ ok: false, status: 404 });
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={onOpenChange}
        onUpdated={vi.fn()}
        onStockMissing={onStockMissing}
      />,
    );
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onStockMissing).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('SED-05b: 404 のメッセージをダイアログ内に描画しない（閉じると同時に消えるため）', async () => {
    // 回帰ガード。以前の実装は setErrorMessage(...) の直後に onOpenChange(false) を呼んでおり、
    // メッセージがダイアログ内にしか無いため実環境では一度も表示されなかった。
    // onOpenChange を「実際に閉じる」形（stock を null にする）で再現して検出する。
    const user = userEvent.setup();
    putStock.mockResolvedValue({ ok: false, status: 404 });
    function Host(): JSX.Element {
      const [stock, setStock] = useState<StockDto | null>(createStock());
      return (
        <StockEditDialog
          stock={stock}
          onOpenChange={(open) => {
            if (!open) {
              setStock(null);
            }
          }}
          onUpdated={vi.fn()}
          onStockMissing={vi.fn()}
        />
      );
    }
    render(<Host />);
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText('この在庫はすでに削除されています')).toBeNull();
  });

  it('SED-06: 422 のエラーを fieldErrors に反映する', async () => {
    const user = userEvent.setup();
    putStock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Stock amount must be positive' }),
    });
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('Stock amount must be positive')).toBeDefined();
    expect(screen.getByLabelText('数量').getAttribute('aria-invalid')).toBe('true');
  });

  it('SED-07: 数量0以下はクライアントで拒否し PUT しない', async () => {
    const user = userEvent.setup();
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    const amount = (await screen.findByDisplayValue('2個')) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '0個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(putStock).not.toHaveBeenCalled();
    expect(screen.getByText(/0より大きい値/)).toBeDefined();
  });

  it('SED-08: 賞味期限を空にすると expiresAt: null を送る', async () => {
    const user = userEvent.setup();
    putStock.mockResolvedValue({ ok: true });
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');
    fireEvent.change(screen.getByLabelText('賞味期限'), { target: { value: '' } });

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(putStock).toHaveBeenCalledWith(
      expect.objectContaining({ json: expect.objectContaining({ expiresAt: null }) }),
    );
  });

  it('SED-09: 保存場所を未設定にすると storedLocation: null を送る', async () => {
    const user = userEvent.setup();
    putStock.mockResolvedValue({ ok: true });
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');
    await user.click(screen.getByRole('combobox', { name: '保存場所' }));
    await user.click(screen.getByRole('option', { name: '未設定' }));

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(putStock).toHaveBeenCalledWith(
      expect.objectContaining({ json: expect.objectContaining({ storedLocation: null }) }),
    );
  });

  it('SED-10: 通信エラー時は入力値を保持してダイアログを閉じない', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    putStock.mockRejectedValue(new Error('network'));
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={onOpenChange}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    const amount = (await screen.findByDisplayValue('2個')) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '5個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('通信エラーが発生しました')).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(amount.value).toBe('5個');
  });

  it('SED-11: 保存中は保存ボタンを disabled にする', async () => {
    const user = userEvent.setup();
    putStock.mockReturnValue(new Promise(() => {}));
    render(
      <StockEditDialog
        stock={createStock()}
        onOpenChange={vi.fn()}
        onUpdated={vi.fn()}
        onStockMissing={vi.fn()}
      />,
    );
    await screen.findByDisplayValue('2個');

    await user.click(screen.getByRole('button', { name: '保存' }));

    const submitting = await screen.findByRole('button', { name: '保存中' });
    expect(submitting.hasAttribute('disabled')).toBe(true);
  });
});
