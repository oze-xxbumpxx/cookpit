import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { revokeOtherSessions } = vi.hoisted(() => ({ revokeOtherSessions: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { revokeOtherSessions: (...args: unknown[]) => revokeOtherSessions(...args) },
}));

import { RevokeOtherSessionsButton } from '../../../../../src/app/more/account/_components/revoke-other-sessions-button';

describe('RevokeOtherSessionsButton', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('CT-24: クリックで authClient.revokeOtherSessions() が呼ばれる', async () => {
    revokeOtherSessions.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<RevokeOtherSessionsButton />);

    await user.click(screen.getByRole('button', { name: '他の端末をログアウトする' }));

    await waitFor(() => {
      expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
    });
  });

  it('成功時は成功文言を表示する', async () => {
    revokeOtherSessions.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<RevokeOtherSessionsButton />);

    await user.click(screen.getByRole('button', { name: '他の端末をログアウトする' }));

    expect(await screen.findByText('他の端末からログアウトしました。')).toBeTruthy();
  });

  it('失敗時は失敗文言を表示する', async () => {
    revokeOtherSessions.mockResolvedValue({ data: null, error: { status: 500, statusText: 'x' } });
    const user = userEvent.setup();
    render(<RevokeOtherSessionsButton />);

    await user.click(screen.getByRole('button', { name: '他の端末をログアウトする' }));

    expect(await screen.findByText('操作に失敗しました。')).toBeTruthy();
  });
});
