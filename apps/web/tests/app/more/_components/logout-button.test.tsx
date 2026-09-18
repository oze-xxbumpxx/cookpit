import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

import { LogoutButton } from '../../../../src/app/more/_components/logout-button';

describe('LogoutButton', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('CT-18: クリックで signOut → 対象3キャッシュの delete → /login へ遷移する', async () => {
    signOut.mockResolvedValue({ data: {}, error: null });
    const assign = vi.fn();
    const cachesDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('location', { assign });
    vi.stubGlobal('caches', { delete: cachesDelete });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/login');
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(cachesDelete).toHaveBeenCalledWith('shopping-list-detail-cache');
    expect(cachesDelete).toHaveBeenCalledWith('shopping-lists-pages-cache');
    expect(cachesDelete).toHaveBeenCalledWith('stores-cache');
    expect(cachesDelete).toHaveBeenCalledTimes(3);
  });

  it('caches が無い環境でも例外を投げず /login まで遷移する（ベストエフォート）', async () => {
    signOut.mockResolvedValue({ data: {}, error: null });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    vi.stubGlobal('caches', undefined);
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/login');
    });
  });

  it('CT-19: signOut 失敗時はエラーバナーを表示し遷移しない', async () => {
    signOut.mockResolvedValue({ data: null, error: { status: 500, statusText: 'x' } });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByText('操作に失敗しました。')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('signOut が reject した場合もエラーバナーを表示し遷移しない', async () => {
    signOut.mockRejectedValue(new Error('network down'));
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByText('操作に失敗しました。')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });
});
