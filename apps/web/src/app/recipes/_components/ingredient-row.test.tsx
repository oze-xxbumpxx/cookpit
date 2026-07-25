import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IngredientRow, type IngredientRowValue } from './ingredient-row';

function createValue(overrides: Partial<IngredientRowValue> = {}): IngredientRowValue {
  return {
    id: 'ingredient-0',
    displayName: '',
    amountText: '',
    ...overrides,
  };
}

describe('IngredientRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('IR-01: 食材名・分量（数量+単位）の変更が onChange に反映される', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IngredientRow
        value={createValue()}
        index={0}
        errorMessage={null}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('食材名'), '玉');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ displayName: '玉' }));

    // 分量は数量と単位を 1 欄で入力する（要望2）。
    await user.type(screen.getByLabelText('分量'), '2');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ amountText: '2' }));
  });

  it('IR-02: 分量は数量と単位を統合した 1 つの入力欄（textbox）である', () => {
    render(
      <IngredientRow
        value={createValue()}
        index={0}
        errorMessage={null}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('分量') as HTMLInputElement;
    expect(amountInput.tagName).toBe('INPUT');
    expect(screen.queryByLabelText('単位')).toBeNull();
  });

  it('IR-03: 削除ボタンで onRemove が呼ばれ、エラーがあるときのみメッセージ表示される', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(
      <IngredientRow
        value={createValue()}
        index={0}
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
        index={0}
        errorMessage="食材名を入力してください。"
        onChange={vi.fn()}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('食材名を入力してください。')).toBeDefined();
  });
});
