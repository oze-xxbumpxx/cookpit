import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IngredientRow, type IngredientRowValue } from './ingredient-row';

function createValue(overrides: Partial<IngredientRowValue> = {}): IngredientRowValue {
  return {
    id: 'ingredient-0',
    displayName: '',
    amountText: '',
    amountUnit: '',
    ...overrides,
  };
}

describe('IngredientRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('IR-01: 食材名・量・単位の変更が onChange に反映される', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IngredientRow
        value={createValue()}
        errorMessage={null}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('食材名'), '玉');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ displayName: '玉' }));

    await user.type(screen.getByLabelText('量'), '2');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ amountText: '2' }));

    // 単位は自由入力（項目3）。プリセット外の文字列もそのまま反映される。
    await user.type(screen.getByLabelText('単位'), '房');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ amountUnit: '房' }));
  });

  it('IR-02: 単位はプリセット候補付きの自由入力欄（textbox）である', () => {
    render(
      <IngredientRow
        value={createValue()}
        errorMessage={null}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const unitInput = screen.getByLabelText('単位') as HTMLInputElement;
    expect(unitInput.tagName).toBe('INPUT');
    expect(unitInput.getAttribute('list')).not.toBeNull();
  });

  it('IR-03: 削除ボタンで onRemove が呼ばれ、エラーがあるときのみメッセージ表示される', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(
      <IngredientRow
        value={createValue()}
        errorMessage={null}
        onChange={vi.fn()}
        onRemove={onRemove}
      />,
    );

    expect(screen.queryByText('食材名を入力してください。')).toBeNull();

    await user.click(screen.getByRole('button', { name: '材料を削除' }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <IngredientRow
        value={createValue()}
        errorMessage="食材名を入力してください。"
        onChange={vi.fn()}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('食材名を入力してください。')).toBeDefined();
  });
});
