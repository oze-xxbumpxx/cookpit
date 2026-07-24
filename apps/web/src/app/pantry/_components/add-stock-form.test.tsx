import { UNIT_PRESETS } from '@cookpit/api-contract';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddStockForm } from './add-stock-form';

describe('AddStockForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ASF-01: displayName 未入力時は追加ボタンが disabled', () => {
    render(<AddStockForm submitting={false} onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('ASF-02: 品目名と数量を入力すると追加ボタンが有効化される', async () => {
    const user = userEvent.setup();
    render(<AddStockForm submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);
  });

  it('ASF-03: 任意項目未入力なら storedLocation・expiresAt が null で送信される', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddStockForm submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith({
      displayName: '玉ねぎ',
      amount: { value: 3, unit: 'g' },
      storedLocation: null,
      expiresAt: null,
    });
  });

  it('ASF-04: 数量 0 は disabled（consume と異なり正の値が必須）', async () => {
    const user = userEvent.setup();
    render(<AddStockForm submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '0');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('ASF-05: 保存場所を選択すると storedLocation として送信される', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddStockForm submitting={false} onAdd={onAdd} />);

    await user.click(screen.getByRole('combobox', { name: /保存場所/ }));
    await user.click(screen.getByRole('option', { name: '冷蔵' }));
    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ storedLocation: 'fridge' }));
  });

  it('ASF-06: 賞味期限を入力すると expiresAt 文字列で送信される', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddStockForm submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');
    fireEvent.change(screen.getByLabelText('賞味期限', { exact: false }), {
      target: { value: '2026-07-31' },
    });
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: '2026-07-31' }));
  });

  it('ASF-07: 追加後に入力欄がクリアされる', async () => {
    const user = userEvent.setup();
    render(<AddStockForm submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect((screen.getByLabelText('品目名', { exact: false }) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('数量', { exact: false }) as HTMLInputElement).value).toBe('');
  });

  it('ASF-08: submitting 中は追加ボタンが disabled', async () => {
    const user = userEvent.setup();
    render(<AddStockForm submitting={true} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '玉ねぎ');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('ASF-09: 単位は自由入力欄で、プリセット候補（datalist）を全件持つ（項目3）', () => {
    render(<AddStockForm submitting={false} onAdd={vi.fn()} />);

    const unitInput = screen.getByLabelText('単位') as HTMLInputElement;
    expect(unitInput.tagName).toBe('INPUT');
    const listId = unitInput.getAttribute('list');
    expect(listId).not.toBeNull();
    expect(document.getElementById(listId as string)?.querySelectorAll('option')).toHaveLength(
      UNIT_PRESETS.length,
    );
  });

  it('ASF-10: プリセット外の単位を自由入力して送信できる（項目3）', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddStockForm submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '納豆');
    await user.type(screen.getByLabelText('数量', { exact: false }), '3');
    await user.clear(screen.getByLabelText('単位'));
    await user.type(screen.getByLabelText('単位'), 'パック');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { value: 3, unit: 'パック' } }),
    );
  });
});
