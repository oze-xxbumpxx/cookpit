import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_FAILURE_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  useApiAction,
  type ApiAction,
} from './use-api-action';

/** Hono の ClientResponse のうち、フックが参照する部分だけを模した成功レスポンス。 */
function okResponse<T>(body: T): { ok: true; json: () => Promise<T> } {
  return { ok: true, json: () => Promise.resolve(body) };
}

function errorResponse(): { ok: false; json: () => Promise<never> } {
  return { ok: false, json: () => Promise.reject(new Error('should not be parsed')) };
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

  it('UAA-04: 例外時は通信エラー文言を出す', async () => {
    const { result } = renderHook(() => useApiAction());

    await runAction(result, (action) =>
      action.run(() => Promise.reject(new Error('network down'))),
    );

    expect(result.current.errorMessage).toBe(NETWORK_ERROR_MESSAGE);
    expect(result.current.pending).toBe(false);
  });

  it('UAA-05: 実行中は pendingKey が立ち、同じキーの二重実行は無視される', async () => {
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

    expect(result.current.pendingKey).toBeNull();
  });

  it('UAA-06: silent 指定では pendingKey もエラー文言も更新しない', async () => {
    const { result } = renderHook(() => useApiAction());

    await runAction(result, (action) =>
      action.run(() => Promise.resolve(errorResponse()), { silent: true }),
    );

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.pendingKey).toBeNull();
  });

  it('UAA-07: onSuccessWithoutBody のときは json() を呼ばない', async () => {
    const { result } = renderHook(() => useApiAction());
    const json = vi.fn(() => Promise.reject(new Error('body is not JSON')));
    const onSuccessWithoutBody = vi.fn();

    await runAction(result, (action) =>
      action.run(() => Promise.resolve({ ok: true as const, json }), { onSuccessWithoutBody }),
    );

    expect(json).not.toHaveBeenCalled();
    expect(onSuccessWithoutBody).toHaveBeenCalledTimes(1);
    expect(result.current.errorMessage).toBeNull();
  });
});
