import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { changePassword } = vi.hoisted(() => ({ changePassword: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: (...args: unknown[]) => changePassword(...args) },
}));

import { ChangePasswordForm } from '../../../../../src/app/more/account/_components/change-password-form';

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { current = 'old-password-1234', next = 'new-password-1234', confirm = 'new-password-1234' } = {},
): Promise<void> {
  await user.type(screen.getByLabelText('現在のパスワード'), current);
  await user.type(screen.getByLabelText('新しいパスワード', { exact: true }), next);
  await user.type(screen.getByLabelText('新しいパスワード（確認）'), confirm);
}

describe('ChangePasswordForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('CT-23: 新パスワードと確認が不一致だと送信されずエラー表示する', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillForm(user, { confirm: 'different-password' });

    expect(await screen.findByText('新しいパスワードと確認が一致しません。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '変更する' }).hasAttribute('disabled')).toBe(true);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('送信で authClient.changePassword が正しい引数で呼ばれる', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password-1234',
        newPassword: 'new-password-1234',
        revokeOtherSessions: true,
      });
    });
  });

  it('CT-21: 成功時に成功文言を表示する', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: '変更する' }));

    expect(
      await screen.findByText('パスワードを変更しました。他の端末では再ログインが必要です。'),
    ).toBeTruthy();
  });

  it('CT-22: 現在のパスワード誤りでエラー文言を表示し、成功文言は出ない', async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 400, statusText: 'x' } });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: '変更する' }));

    expect(await screen.findByText('現在のパスワードが正しくありません。')).toBeTruthy();
    expect(
      screen.queryByText('パスワードを変更しました。他の端末では再ログインが必要です。'),
    ).toBeNull();
  });

  it('新パスワードの文字数ヒントを表示する', () => {
    render(<ChangePasswordForm />);

    expect(screen.getByText('12 文字以上 128 文字以下で入力してください。')).toBeTruthy();
  });

  // F-01: status/code で文言を分岐する（docs/reviews/better-auth-login.md EV-06 の実測値）。
  it.each([
    [
      { status: 400, statusText: 'x', code: 'PASSWORD_TOO_SHORT' },
      'パスワードは 12〜128 文字にしてください。',
    ],
    [
      { status: 400, statusText: 'x', code: 'PASSWORD_TOO_LONG' },
      'パスワードは 12〜128 文字にしてください。',
    ],
    [
      { status: 429, statusText: 'x' },
      '試行回数が多すぎます。しばらく待ってから再度お試しください。',
    ],
    [
      { status: 400, statusText: 'x', code: 'INVALID_PASSWORD' },
      '現在のパスワードが正しくありません。',
    ],
  ])('F-01: changePassword のエラー %o → %s', async (error, expected) => {
    changePassword.mockResolvedValue({ data: null, error });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: '変更する' }));

    expect(await screen.findByText(expected)).toBeTruthy();
  });
});
