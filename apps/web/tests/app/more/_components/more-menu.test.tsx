import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}));

import { MoreMenu } from '../../../../src/app/more/_components/more-menu';

describe('MoreMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('MM-01: レシピへのリンクを表示する', () => {
    render(<MoreMenu />);

    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
  });

  it('MM-02: 商品へのリンクを表示する', () => {
    render(<MoreMenu />);

    expect(screen.getByRole('link', { name: '商品' }).getAttribute('href')).toBe('/products');
  });

  it('CT-16: アカウントへのリンクを表示する', () => {
    render(<MoreMenu />);

    expect(screen.getByRole('link', { name: 'アカウント' }).getAttribute('href')).toBe(
      '/more/account',
    );
  });

  it('CT-17/MM-03: リンクはちょうど 3 件（過不足なし。レシピ・商品・アカウント）', () => {
    render(<MoreMenu />);

    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('CT-17b: ログアウトボタンがちょうど 1 件描画される', () => {
    render(<MoreMenu />);

    expect(screen.getAllByRole('button', { name: 'ログアウト' })).toHaveLength(1);
  });
});
