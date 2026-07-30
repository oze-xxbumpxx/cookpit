import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../../../src/app/_components/theme-toggle';

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  cleanup();
});

describe('ThemeToggle', () => {
  it('クリックで system→light→dark→system と循環し localStorage に保存する', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    expect(button.getAttribute('aria-label')).toContain('OS に追従');

    await user.click(button);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(button.getAttribute('aria-label')).toContain('ライト');

    await user.click(button);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(button);
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('保存済みテーマを初期表示に反映する', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);

    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('ダーク');
  });
});
