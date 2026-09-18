import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_FAILURE_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  useApiAction,
  type ApiAction,
} from '../../src/lib/use-api-action';

/** Hono の ClientResponse のうち、フックが参照する部分だけを模した成功レスポンス。 */
function okResponse<T>(body: T): { ok: true; status: number; json: () => Promise<T> } {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function errorResponse(status = 500): { ok: false; status: number; json: () => Promise<never> } {
  return { ok: false, status, json: () => Promise.reject(new Error('should not be parsed')) };
}

/** `run` を await しつつ、その中の state 更新を act でまとめる。 */
async function runAction(
  result: { current: ApiAction },
  invoke: (action: ApiAction) => Promise<void>,
): Promise<void> {
  await act(async () => {
    await invoke(result.current);
  });
}

describe('useApiAction', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('UAA-01: 成功時は onSuccess に本文を渡し、エラー文言は null のまま', async () => {
    const { result } = renderHook(() => useApiAction());
    const onSuccess = vi.fn();

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(okResponse({ id: 'list-1' })), { onSuccess }),
    );

    expect(onSuccess).toHaveBeenCalledWith({ id: 'list-1' });
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('UAA-02: !ok のときは既定の失敗文言を出し、onSuccess は呼ばない', async () => {
    const { result } = renderHook(() => useApiAction());
    const onSuccess = vi.fn();

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse()), { onSuccess }),
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe(API_FAILURE_MESSAGE);
  });

  it('UAA-03: failureMessage を指定するとその文言を出す', async () => {
    const { result } = renderHook(() => useApiAction());

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse()), {
        failureMessage: '在庫の追加に失敗しました。',
      }),
    );

    expect(result.current.errorMessage).toBe('在庫の追加に失敗しました。');
  });

  it('UAA-09: failureMessage に関数を渡すと HTTP ステータスで文言を出し分けられる', async () => {
    const { result } = renderHook(() => useApiAction());
    const failureMessage = (status: number): string =>
      status === 422 ? '完了後は変更できません。' : API_FAILURE_MESSAGE;

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse(422)), { failureMessage }),
    );
    expect(result.current.errorMessage).toBe('完了後は変更できません。');

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse(500)), { failureMessage }),
    );
    expect(result.current.errorMessage).toBe(API_FAILURE_MESSAGE);
  });

  it('UAA-04: 例外時は通信エラー文言を出す', async () => {
    const { result } = renderHook(() => useApiAction());

    await runAction(result, (action) =>
      action.run(() => Promise.reject(new Error('network down'))),
    );

    expect(result.current.errorMessage).toBe(NETWORK_ERROR_MESSAGE);
    expect(result.current.pending).toBe(false);
  });

  it('UAA-05: 実行中は isPending が立ち、同じキーの二重実行は無視される', async () => {
    const { result } = renderHook(() => useApiAction());
    let release: (() => void) | null = null;
    const request = vi.fn(
      () =>
        new Promise<ReturnType<typeof okResponse<{ id: string }>>>((resolve) => {
          release = () => resolve(okResponse({ id: 'list-1' }));
        }),
    );

    let firstRun: Promise<void> | null = null;
    await act(async () => {
      firstRun = result.current.run(request, { key: 'sync' });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPending('sync')).toBe(true);
    });

    // 実行中に同じキーで呼んでもリクエストは増えない
    await act(async () => {
      await result.current.run(request, { key: 'sync' });
    });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await firstRun;
    });

    expect(result.current.isPending('sync')).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it('UAA-06: silent 指定では実行中フラグもエラー文言も更新しない', async () => {
    const { result } = renderHook(() => useApiAction());

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse()), { silent: true }),
    );

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('UAA-08: 別キーの操作は並行しても実行中フラグを奪い合わない（S1 回帰）', async () => {
    const { result } = renderHook(() => useApiAction());
    const release: Record<string, (() => void) | null> = { refresh: null, add: null };
    const request = (key: string) => () =>
      new Promise<ReturnType<typeof okResponse<{ id: string }>>>((resolve) => {
        release[key] = () => resolve(okResponse({ id: key }));
      });

    let refreshRun: Promise<void> | null = null;
    let addRun: Promise<void> | null = null;

    await act(async () => {
      refreshRun = result.current.run(request('refresh'), { key: 'refresh' });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.isPending('refresh')).toBe(true);
    });

    // refresh が in-flight のまま add を開始しても refresh の実行中フラグは維持される
    await act(async () => {
      addRun = result.current.run(request('add'), { key: 'add' });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.isPending('add')).toBe(true);
    });
    expect(result.current.isPending('refresh')).toBe(true);

    // add だけ完了しても refresh の実行中フラグは落ちない
    await act(async () => {
      release.add?.();
      await addRun;
    });
    expect(result.current.isPending('add')).toBe(false);
    expect(result.current.isPending('refresh')).toBe(true);

    await act(async () => {
      release.refresh?.();
      await refreshRun;
    });
    expect(result.current.pending).toBe(false);
  });

  it('UAA-07: onSuccessWithoutBody のときは json() を呼ばない', async () => {
    const { result } = renderHook(() => useApiAction());
    const json = vi.fn(() => Promise.reject(new Error('body is not JSON')));
    const onSuccessWithoutBody = vi.fn();

    await runAction(result, (action) =>
      action.run(() => Promise.resolve({ ok: true as const, status: 200, json }), {
        onSuccessWithoutBody,
      }),
    );

    expect(json).not.toHaveBeenCalled();
    expect(onSuccessWithoutBody).toHaveBeenCalledTimes(1);
    expect(result.current.errorMessage).toBeNull();
  });

  describe('401 → /login?next= 遷移（D-8）', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function stubLocation(pathname: string, search: string): { assign: ReturnType<typeof vi.fn> } {
      const assign = vi.fn();
      vi.stubGlobal('location', { pathname, search, assign });
      return { assign };
    }

    it('CT-27: 401 受信で /login?next=<現在地> へ遷移する', async () => {
      const { assign } = stubLocation('/pantry', '?tab=a');
      const { result } = renderHook(() => useApiAction());

      await runAction(result, (action) => action.run(() => Promise.resolve(errorResponse(401))));

      expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/pantry?tab=a')}`);
      expect(result.current.errorMessage).toBeNull();
    });

    it('CT-28: silent: true でも 401 では遷移する', async () => {
      const { assign } = stubLocation('/shopping-lists', '');
      const { result } = renderHook(() => useApiAction());

      await runAction(result, (action) =>
        action.run(() => Promise.resolve(errorResponse(401)), { silent: true }),
      );

      expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/shopping-lists')}`);
      expect(result.current.errorMessage).toBeNull();
    });

    it('CT-29: 401 以外（500）は遷移せず既存どおり失敗文言を表示する（回帰）', async () => {
      const { assign } = stubLocation('/pantry', '');
      const { result } = renderHook(() => useApiAction());

      await runAction(result, (action) => action.run(() => Promise.resolve(errorResponse(500))));

      expect(assign).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toBe(API_FAILURE_MESSAGE);
    });
  });
});
