import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

import { useLeaveConfirmation } from './use-leave-confirmation';

const FALLBACK = '/recipes';

function Harness({ dirty }: { dirty: boolean }) {
  const leave = useLeaveConfirmation({ dirty, fallbackHref: FALLBACK });
  return (
    <div>
      <button type="button" onClick={() => leave.requestLeave(FALLBACK)}>
        キャンセル
      </button>
      <button type="button" onClick={() => leave.leaveAfterSave(FALLBACK)}>
        保存完了
      </button>
      <button type="button" onClick={leave.confirmLeave}>
        戻る
      </button>
      <button type="button" onClick={() => leave.onConfirmOpenChange(false)}>
        編集を続ける
      </button>
      <a href="/pantry">在庫へ</a>
      <a href="/meal-plans" aria-label="献立へ">
        <svg data-testid="nav-icon" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="8" />
        </svg>
      </a>
      <a href="https://example.com/external">外部へ</a>
      <a href="/products" target="_blank" rel="noreferrer">
        別タブへ
      </a>
      <p>{leave.confirmOpen ? 'ダイアログ表示中' : 'ダイアログ非表示'}</p>
    </div>
  );
}

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pushStateSpy = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function dialogVisible(): boolean {
  return screen.queryByText('ダイアログ表示中') !== null;
}

describe('useLeaveConfirmation', () => {
  it('LG-01: dirty でなければ requestLeave は確認せず即遷移する', async () => {
    const user = userEvent.setup();
    render(<Harness dirty={false} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(push).toHaveBeenCalledWith(FALLBACK);
    expect(dialogVisible()).toBe(false);
  });

  it('LG-02: dirty のとき requestLeave はダイアログを開き遷移しない', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(dialogVisible()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('LG-03: dirty が false → true になったとき sentinel を 1 回だけ積む', () => {
    const { rerender } = render(<Harness dirty={false} />);
    expect(pushStateSpy).not.toHaveBeenCalled();

    rerender(<Harness dirty />);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    rerender(<Harness dirty />);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });

  it('LG-04: popstate でダイアログが開く', () => {
    render(<Harness dirty />);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(dialogVisible()).toBe(true);
  });

  it('LG-05: 「編集を続ける」で遷移せず sentinel を積み直す', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const pushStateCallsBefore = pushStateSpy.mock.calls.length;

    await user.click(screen.getByRole('button', { name: '編集を続ける' }));

    expect(dialogVisible()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(pushStateSpy.mock.calls.length).toBe(pushStateCallsBefore + 1);
  });

  it('LG-06: sentinel が残っているとき confirmLeave は replace で遷移する', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(replace).toHaveBeenCalledWith(FALLBACK);
    expect(push).not.toHaveBeenCalled();
  });

  it('LG-07: popstate で sentinel が消費済みなら confirmLeave は push で遷移する', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(push).toHaveBeenCalledWith(FALLBACK);
    expect(replace).not.toHaveBeenCalled();
  });

  it('LG-08: leaveAfterSave 後は popstate でダイアログが開かない', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('button', { name: '保存完了' }));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(dialogVisible()).toBe(false);
  });

  it('LG-09: dirty のとき内部リンクのクリックを捕まえダイアログを開く', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('link', { name: '在庫へ' }));

    expect(dialogVisible()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('LG-10: 内部リンクで「戻る」を選ぶとそのリンク先へ遷移する', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('link', { name: '在庫へ' }));
    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(replace).toHaveBeenCalledWith('/pantry');
  });

  it('LG-11: dirty でなければリンククリックを捕まえない', async () => {
    const user = userEvent.setup();
    render(<Harness dirty={false} />);

    await user.click(screen.getByRole('link', { name: '在庫へ' }));

    expect(dialogVisible()).toBe(false);
  });

  it('LG-12: 外部オリジン・別タブのリンクは捕まえない', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole('link', { name: '外部へ' }));
    expect(dialogVisible()).toBe(false);

    await user.click(screen.getByRole('link', { name: '別タブへ' }));
    expect(dialogVisible()).toBe(false);
  });

  it('LG-13: 修飾キー付きクリックは捕まえない', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', { name: '在庫へ' }));
    await user.keyboard('{/Meta}');

    expect(dialogVisible()).toBe(false);
  });

  // 実機確認 E-5 の回帰: ボトムナビのタブはアイコン（SVG）を含むため、クリック対象が
  // SVGElement になる。HTMLElement で判定していたときはここで素通りしていた。
  it('LG-15: リンク内の SVG アイコンをクリックしても捕まえる', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByTestId('nav-icon'));

    expect(dialogVisible()).toBe(true);
  });

  it('LG-16: SVG 経由でも「戻る」でそのリンク先へ遷移する', async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByTestId('nav-icon'));
    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(replace).toHaveBeenCalledWith('/meal-plans');
  });

  it('LG-14: アンマウント後は popstate でも何も起きない', () => {
    const { unmount } = render(<Harness dirty />);
    unmount();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.queryByText('ダイアログ表示中')).toBeNull();
  });
});
