import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompleteShoppingPanel } from '../../../../src/app/shopping-lists/_components/complete-shopping-panel';
import { createShoppingItemDto } from './shopping-list-test-fixtures';

const onionItem = createShoppingItemDto({
  id: 'item-1',
  displayName: '玉ねぎ',
  status: 'bought',
  requiredAmount: { value: 3, unit: '個' },
});

/** 「適量」など数量を持たない品目（requiredAmount と amountNote は排他）。 */
const saltItem = createShoppingItemDto({
  id: 'item-2',
  displayName: '塩',
  status: 'bought',
  requiredAmount: null,
  amountNote: '適量',
});

function renderPanel(items = [onionItem], submitting = false) {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  render(
    <CompleteShoppingPanel
      items={items}
      submitting={submitting}
      onCancel={onCancel}
      onComplete={onComplete}
    />,
  );
  return { onComplete, onCancel };
}

describe('CompleteShoppingPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('P-1: requiredAmount を持つ品目は数量がプリフィルされ既定で選択される', () => {
    renderPanel();

    expect(screen.getByLabelText('数量')).toHaveProperty('value', '3個');
    expect(screen.getByRole('checkbox', { name: /玉ねぎ/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('P-2: 数量を持たない品目は空・未選択・選択不可で表示される', () => {
    renderPanel([saltItem]);

    expect(screen.getByLabelText('数量')).toHaveProperty('value', '');
    const checkbox = screen.getByRole('checkbox', { name: /塩/ });
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('数量と単位を入力すると在庫に追加できます（例：3個）')).toBeDefined();
  });

  it('P-3: 数量を入力すると選択できるようになる', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel([saltItem]);

    await user.type(screen.getByLabelText('数量'), '1袋');

    const checkbox = screen.getByRole('checkbox', { name: /塩/ });
    expect(checkbox.hasAttribute('disabled')).toBe(false);

    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      {
        itemId: 'item-2',
        amount: { value: 1, unit: '袋' },
        storedLocation: null,
        expiresAt: null,
      },
    ]);
  });

  it('P-4: 数量を 0 に変えるとその行は選択不可になり選択も外れる', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText('数量'));
    await user.type(screen.getByLabelText('数量'), '0個');

    const checkbox = screen.getByRole('checkbox', { name: /玉ねぎ/ });
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });

  it('P-5: 「すべて選択」は数量が有効な行だけを選択する', async () => {
    const user = userEvent.setup();
    renderPanel([onionItem, saltItem]);

    await user.click(screen.getByRole('button', { name: 'すべて解除' }));
    await user.click(screen.getByRole('button', { name: 'すべて選択' }));

    expect(screen.getByRole('checkbox', { name: /玉ねぎ/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    // 数量を持たない行は「すべて選択」でも選択されない。
    expect(screen.getByRole('checkbox', { name: /塩/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('P-6: 編集した数量が onComplete に渡る', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();

    await user.clear(screen.getByLabelText('数量'));
    await user.type(screen.getByLabelText('数量'), '500g');
    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      {
        itemId: 'item-1',
        amount: { value: 500, unit: 'g' },
        storedLocation: null,
        expiresAt: null,
      },
    ]);
  });

  it('P-7: 選んだ保存場所が onComplete に渡る', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '冷蔵' }));
    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ storedLocation: 'fridge' }),
    ]);
  });

  it('P-8: すべて解除しても「完了する」で空配列を渡せる', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'すべて解除' }));
    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('P-9: submitting 中は完了・キャンセルを disabled にする', () => {
    renderPanel([onionItem], true);

    expect(screen.getByRole('button', { name: '完了する' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'キャンセル' }).hasAttribute('disabled')).toBe(true);
  });

  it('「キャンセル」で onCancel を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onCancel, onComplete } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('CSP-01: 既定では日付入力を表示せず、設定ボタンで独立行を展開する', async () => {
    const user = userEvent.setup();
    renderPanel();
    const toggle = screen.getByRole('button', { name: '賞味期限を設定' });

    expect(screen.queryByLabelText('賞味期限')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);

    expect(screen.getByLabelText('賞味期限')).toBeDefined();
    expect(
      screen.getByRole('button', { name: '賞味期限を削除' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('CSP-02: 期限を展開せず完了すると expiresAt: null を送る', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();

    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'item-1', expiresAt: null }),
    ]);
  });

  it('CSP-03: 入力した賞味期限を対象品目の expiresAt に送る', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();
    await user.click(screen.getByRole('button', { name: '賞味期限を設定' }));
    fireEvent.change(screen.getByLabelText('賞味期限'), { target: { value: '2026-08-20' } });

    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'item-1', expiresAt: '2026-08-20' }),
    ]);
  });

  it('CSP-04: 賞味期限を削除すると値をクリアし expiresAt: null を送る', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderPanel();
    await user.click(screen.getByRole('button', { name: '賞味期限を設定' }));
    fireEvent.change(screen.getByLabelText('賞味期限'), { target: { value: '2026-08-20' } });

    await user.click(screen.getByRole('button', { name: '賞味期限を削除' }));
    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(screen.queryByLabelText('賞味期限')).toBeNull();
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'item-1', expiresAt: null }),
    ]);
  });

  it('CSP-05: 複数品目のうち入力した品目だけ期限を送る', async () => {
    const user = userEvent.setup();
    const carrotItem = createShoppingItemDto({
      id: 'item-3',
      displayName: 'にんじん',
      status: 'bought',
      requiredAmount: { value: 2, unit: '本' },
    });
    const { onComplete } = renderPanel([onionItem, carrotItem]);
    await user.click(screen.getAllByRole('button', { name: '賞味期限を設定' })[0]);
    fireEvent.change(screen.getByLabelText('賞味期限'), { target: { value: '2026-08-20' } });

    await user.click(screen.getByRole('button', { name: '完了する' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'item-1', expiresAt: '2026-08-20' }),
      expect.objectContaining({ itemId: 'item-3', expiresAt: null }),
    ]);
  });

  it('CSP-06: すべて解除・選択を挟んでも期限の入力と展開状態を維持する', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: '賞味期限を設定' }));
    fireEvent.change(screen.getByLabelText('賞味期限'), { target: { value: '2026-08-20' } });

    await user.click(screen.getByRole('button', { name: 'すべて解除' }));
    await user.click(screen.getByRole('button', { name: 'すべて選択' }));

    expect((screen.getByLabelText('賞味期限') as HTMLInputElement).value).toBe('2026-08-20');
    expect(
      screen.getByRole('button', { name: '賞味期限を削除' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
