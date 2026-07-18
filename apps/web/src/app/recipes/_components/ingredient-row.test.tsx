import { unitSchema } from '@cookpit/api-contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IngredientRow, type IngredientRowValue } from './ingredient-row';

const UNIT_OPTIONS = unitSchema.options;

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
        unitOptions={UNIT_OPTIONS}
      />,
    );

    await user.type(screen.getByLabelText('食材名'), '玉');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ displayName: '玉' }));

    await user.type(screen.getByLabelText('量'), '2');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ amountText: '2' }));

    await user.selectOptions(screen.getByLabelText('単位'), '個');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ amountUnit: '個' }));
  });

  it('IR-02: 単位選択肢は空オプション + unitOptions 全件が描画される', () => {
    render(
      <IngredientRow
        value={createValue()}
        errorMessage={null}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        unitOptions={UNIT_OPTIONS}
      />,
    );

    const select = screen.getByLabelText('単位');
    expect(within(select).getAllByRole('option')).toHaveLength(UNIT_OPTIONS.length + 1);
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
        unitOptions={UNIT_OPTIONS}
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
        unitOptions={UNIT_OPTIONS}
      />,
    );
    expect(screen.getByText('食材名を入力してください。')).toBeDefined();
  });
});
