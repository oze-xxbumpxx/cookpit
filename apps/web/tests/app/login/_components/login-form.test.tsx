import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { signInEmail } = vi.hoisted(() => ({ signInEmail: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } },
}));

import { LoginForm } from '../../../../src/app/login/_components/login-form';

function stubLocation(): { assign: ReturnType<typeof vi.fn> } {
  const assign = vi.fn();
  // origin は safeNext の URL 解決（SEC-1 の二重化）に必要。実際の window.location と同じ形。
  vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
  return { assign };
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  email = 'user@example.test',
  password = 'password-1234',
): Promise<void> {
  await user.type(screen.getByLabelText('メールアドレス'), email);
  await user.type(screen.getByLabelText('パスワード'), password);
}

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('CT-01: 初期表示でメール欄・パスワード欄・送信ボタンが表示される', () => {
    render(<LoginForm next="/pantry" />);

    expect(screen.getByLabelText('メールアドレス')).toBeTruthy();
    expect(screen.getByLabelText('パスワード')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeTruthy();
  });

  it('CT-02: 空欄で送信すると authClient.signIn.email は呼ばれない', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);

    expect(screen.getByRole('button', { name: 'ログイン' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('CT-03: 送信中はボタンが無効化され、二重クリックしても signIn.email は1回だけ呼ばれる', async () => {
    const user = userEvent.setup();
    const { assign } = stubLocation();
    let resolveSignIn: ((value: { data: unknown; error: null }) => void) | undefined;
    signInEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログイン中' }).hasAttribute('disabled')).toBe(
        true,
      );
    });
    expect(signInEmail).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'ログイン中' }));
    expect(signInEmail).toHaveBeenCalledTimes(1);

    resolveSignIn?.({ data: {}, error: null });
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/pantry');
    });
  });

  it('CT-04: 401/403 は区別せず統一文言を表示する', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, statusText: 'x' } });
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('メールアドレスまたはパスワードが違います。')).toBeTruthy();
  });

  it('CT-04b: 403 も同じ統一文言を表示する', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 403, statusText: 'x' } });
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('メールアドレスまたはパスワードが違います。')).toBeTruthy();
  });

  it('CT-05: 429 は試行過多の文言を表示する', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 429, statusText: 'x' } });
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByText('試行回数が多すぎます。しばらく待ってから再度お試しください。'),
    ).toBeTruthy();
  });

  it('CT-06: 通信例外は既存 NETWORK_ERROR_MESSAGE を表示する', async () => {
    signInEmail.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('通信エラーが発生しました。')).toBeTruthy();
  });

  it('CT-07: 成功時、next が有効な相対パスならその遷移先へ assign する', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    const { assign } = stubLocation();
    const user = userEvent.setup();
    render(<LoginForm next="/pantry" />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/pantry');
    });
  });

  it.each([
    ['//evil', '/'],
    ['http://evil.example', '/'],
    ['', '/'],
    ['/\\evil', '/'],
    ['/shopping-lists/abc?x=1', '/shopping-lists/abc?x=1'],
    ['/pantry?x=1', '/pantry?x=1'],
    // 正規表現だけでは PASS してしまう制御文字（SEC-1）。WHATWG URL パーサは解決前に
    // TAB/LF/CR を除去するため、"/\t//evil.com" は https://evil.com/ に解決されうる。
    ['/\t//evil.com', '/'],
    ['/\n//evil.com', '/'],
    ['/\r//evil.com', '/'],
    // 見た目は "//" を含むが percent-encode されているため URL パーサはホストと解釈しない。
    ['/%2F%2Fevil', '/%2F%2Fevil'],
  ])('CT-08〜12: safeNext(%s) → %s', async (next, expected) => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    const { assign } = stubLocation();
    const user = userEvent.setup();
    render(<LoginForm next={next} />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(expected);
    });
  });

  it('CT-13: メール欄は autoComplete=username、パスワード欄は autoComplete=current-password', () => {
    render(<LoginForm next="/pantry" />);

    expect(screen.getByLabelText('メールアドレス').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('パスワード').getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });

  it('CT-14: next 未指定時は / へ遷移する', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    const { assign } = stubLocation();
    const user = userEvent.setup();
    render(<LoginForm next={null} />);
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/');
    });
  });
});
