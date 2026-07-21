import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavBar } from './nav-bar';

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

  it('5 つのタブを href つきで表示する', () => {
    state.pathname = '/';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'ホーム' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: '献立' }).getAttribute('href')).toBe('/meal-plans');
    expect(screen.getByRole('link', { name: '買い物' }).getAttribute('href')).toBe(
      '/shopping-lists',
    );
    expect(screen.getByRole('link', { name: '在庫' }).getAttribute('href')).toBe('/pantry');
    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
  });

  it('現在の画面のタブに aria-current=page が付く', () => {
    state.pathname = '/pantry';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: '在庫' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('aria-current')).toBeNull();
  });

  it('詳細ページ（/recipes/abc）でも親セクションのタブがアクティブ', () => {
    state.pathname = '/recipes/abc';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('aria-current')).toBe('page');
  });

  it('ホームは完全一致のときのみアクティブ', () => {
    state.pathname = '/meal-plans';
    render(<NavBar />);

    expect(screen.getByRole('link', { name: 'ホーム' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: '献立' }).getAttribute('aria-current')).toBe('page');
  });
});
