import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavBar } from '../../../src/app/_components/nav-bar';

const state = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
}));

describe('NavBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('NV-01: 5 タブが name+href の組で表示される（過不足なし）', () => {
    state.pathname = '/';
    render(<NavBar />);

    const tabs = screen
      .getAllByRole('link')
      .map((link) => ({ name: link.textContent, href: link.getAttribute('href') }));

    expect(tabs).toEqual([
      { name: 'ホーム', href: '/' },
      { name: '献立', href: '/meal-plans' },
      { name: '買い物', href: '/shopping-lists' },
      { name: '在庫', href: '/pantry' },
      { name: 'その他', href: '/more' },
    ]);
  });

  it('NV-02: レシピ・商品タブが存在しない', () => {
    state.pathname = '/';
    render(<NavBar />);

    expect(screen.queryByRole('link', { name: 'レシピ' })).toBeNull();
    expect(screen.queryByRole('link', { name: '商品' })).toBeNull();
  });

  it('NV-03: /recipes でその他タブが active になる', () => {
    state.pathname = '/recipes';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBe('page');
  });

  it('NV-04: /products でその他タブが active になる', () => {
    state.pathname = '/products';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBe('page');
  });

  it('NV-05: /more でその他タブが active になる', () => {
    state.pathname = '/more';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBe('page');
  });

  it('NV-06: /recipes/abc（ネストパス）でもその他タブが active になる', () => {
    state.pathname = '/recipes/abc';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBe('page');
  });

  it('NV-07: /meal-plans ではホームは非 active、献立は active', () => {
    state.pathname = '/meal-plans';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'ホーム' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: '献立' }).getAttribute('aria-current')).toBe('page');
  });

  it('NV-08: /meal-plans ではその他は active にならない', () => {
    state.pathname = '/meal-plans';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBeNull();
  });

  it('現在の画面のタブに aria-current=page が付く（在庫タブ）', () => {
    state.pathname = '/pantry';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: '在庫' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'その他' }).getAttribute('aria-current')).toBeNull();
  });
});
