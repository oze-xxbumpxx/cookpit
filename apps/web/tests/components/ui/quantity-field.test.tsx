import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantityField } from '../../../src/components/ui/quantity-field';

describe('QuantityField', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('QF-01: 入力を onValueChange にそのまま渡す', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<QuantityField id="qf" value="" onValueChange={onValueChange} />);

    await user.type(screen.getByRole('textbox'), '3');

    expect(onValueChange).toHaveBeenLastCalledWith('3');
  });

  it('QF-02: value を表示する', () => {
    render(<QuantityField id="qf" value="300g" onValueChange={vi.fn()} />);

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('300g');
  });

  it('QF-03: 既定のプレースホルダーで数量+単位の書式を案内する', () => {
    render(<QuantityField id="qf" value="" onValueChange={vi.fn()} />);

    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('例：3個 / 300g');
  });

  it('QF-04: invalid / describedBy を aria 属性へ反映する', () => {
    render(<QuantityField id="qf" value="" onValueChange={vi.fn()} invalid describedBy="err-1" />);

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('err-1');
  });
});
