import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepRow, type StepRowValue } from './step-row';

function createValue(overrides: Partial<StepRowValue> = {}): StepRowValue {
  return {
    id: 'step-0',
    description: '',
    ...overrides,
  };
}

describe('StepRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SR-01: 手順番号が表示され、入力変更が onChange に・削除が onRemove に伝わる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(<StepRow index={1} value={createValue()} onChange={onChange} onRemove={onRemove} />);

    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByLabelText('手順 2')).toBeDefined();

    await user.type(screen.getByLabelText('手順 2'), '切');
    expect(onChange).toHaveBeenLastCalledWith(createValue({ description: '切' }));

    await user.click(screen.getByRole('button', { name: '手順を削除' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
