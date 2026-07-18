import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagFilter } from './tag-filter';

describe('TagFilter', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('TF-01: 「すべて」+ 5 タグが描画され、クリックで onChange に値が渡る', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagFilter value="all" onChange={onChange} />);

    const labels = ['すべて', '主菜', '副菜', '汁物', '作り置き向き', '冷凍可'];
    for (const label of labels) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    await user.click(screen.getByRole('button', { name: '主菜' }));
    expect(onChange).toHaveBeenCalledWith('主菜');

    await user.click(screen.getByRole('button', { name: 'すべて' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
