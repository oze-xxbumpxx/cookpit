'use client';

import { useState } from 'react';

/** `!response.ok`（サーバーがエラーを返した）ときの既定文言。 */
export const API_FAILURE_MESSAGE = '操作に失敗しました。';

/** 通信自体が失敗した（例外が投げられた）ときの文言。 */
export const NETWORK_ERROR_MESSAGE = '通信エラーが発生しました。';

/** `key` を指定しない操作に割り当てるキー。 */
const DEFAULT_KEY = 'default';

function resolveFailureMessage(
  failureMessage: string | ((status: number) => string) | undefined,
  status: number,
): string {
  if (failureMessage === undefined) {
    return API_FAILURE_MESSAGE;
  }
  return typeof failureMessage === 'function' ? failureMessage(status) : failureMessage;
}

/**
 * Hono RPC のレスポンスのうち、このフックが必要とする部分だけを表す。
 * `client.api...$post()` の戻り値はこの形に構造的に適合する。
 */
interface ApiResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * Hono の `ClientResponse` はステータスごとのユニオンで、成功側だけが `ok: true` を持つ。
 * 呼び出し側で `!response.ok` を書いたときと同じ絞り込みを型として再現し、
 * `onSuccess` が成功レスポンスのボディ型だけを受け取るようにする。
 */
type SuccessBodyOf<TResponse> =
  Extract<TResponse, { ok: true }> extends { json: () => Promise<infer TBody> } ? TBody : never;

interface RunOptionsBase {
  /**
   * 実行中であることを表す識別子。行単位の操作では行 ID を渡し、`isPending` と
   * 突き合わせて「操作中の行だけを disable」する。省略時は `'default'`。
   */
  key?: string;
  /**
   * `!response.ok` のときの文言。省略時は {@link API_FAILURE_MESSAGE}。
   * 関数を渡すと HTTP ステータスを受け取り、状態に応じた文言を返せる
   * （例: 422 のときだけ理由と回復手段を示す）。
   */
  failureMessage?: string | ((status: number) => string);
  /**
   * true のとき、実行中フラグもエラー文言も更新しない。画面にフィードバックを出さない
   * バックグラウンド再取得（focus 時の同期など）で使う。
   * **例外**: 401（セッション切れ）を受信した場合はこの抑制の対象外とし、`silent` でも
   * `/login?next=` へ遷移する（セッション切れはユーザーに見せるべき状態のため。D-8）。
   */
  silent?: boolean;
}

/**
 * 成功コールバックは排他。`onSuccess`（本文を読む）と `onSuccessWithoutBody`
 * （本文を読まない）を同時指定すると型エラーになる。
 */
type RunOptions<T> =
  | (RunOptionsBase & {
      onSuccess: (body: T) => void | Promise<void>;
      onSuccessWithoutBody?: never;
    })
  | (RunOptionsBase & {
      onSuccessWithoutBody: () => void | Promise<void>;
      onSuccess?: never;
    })
  | (RunOptionsBase & {
      onSuccess?: never;
      onSuccessWithoutBody?: never;
    });

export interface ApiAction {
  /** いずれかの操作が実行中か。 */
  pending: boolean;
  /** 直近の失敗の文言。成功・未実行なら null。 */
  errorMessage: string | null;
  /** 画面側の都合でバナーを出し分けたいときに使う（再取得成功時のクリアなど）。 */
  setErrorMessage: (message: string | null) => void;
  /** `key` の操作が実行中かを返す。 */
  isPending: (key: string) => boolean;
  run: <TResponse extends ApiResponseLike>(
    request: () => Promise<TResponse>,
    options?: RunOptions<SuccessBodyOf<TResponse>>,
  ) => Promise<void>;
}

/**
 * API 呼び出しの定型処理（実行中フラグ・二重実行ガード・失敗文言・例外の握り）を 1 箇所に
 * まとめる。同じエラーバナーを共有する操作群は同じインスタンスを共有し、独立したバナーを
 * 持つ操作は別インスタンスを使う。
 *
 * 楽観的更新（`useOptimistic` + `startTransition`）を伴う操作には使わない。
 * それらは状態更新の順序自体が挙動になるため、コンポーネント側に残す。
 */
export function useApiAction(): ApiAction {
  // 実行中のキーは集合で持つ。単一スロットにすると、同じインスタンスを共有する別操作
  // （行の消費と在庫追加など）が並行したときに実行中フラグを奪い合い、応答到着前に
  // ボタンが再活性化してしまう。
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function addPendingKey(key: string): void {
    setPendingKeys((current) => new Set(current).add(key));
  }

  function removePendingKey(key: string): void {
    setPendingKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  async function run<TResponse extends ApiResponseLike>(
    request: () => Promise<TResponse>,
    options: RunOptions<SuccessBodyOf<TResponse>> = {},
  ): Promise<void> {
    const key = options.key ?? DEFAULT_KEY;
    const silent = options.silent ?? false;

    // 同じ操作の二重実行を防ぐ。別キーの操作（別の行など）は並行して実行できる。
    if (pendingKeys.has(key)) {
      return;
    }

    if (!silent) {
      addPendingKey(key);
      setErrorMessage(null);
    }

    try {
      const response = await request();
      if (!response.ok) {
        if (response.status === 401) {
          // セッション切れは silent でも回復させる。next にはクエリ込みの現在地を渡す。
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/login?next=${next}`);
          return;
        }
        if (!silent) {
          setErrorMessage(resolveFailureMessage(options.failureMessage, response.status));
        }
        return;
      }
      if (options.onSuccess !== undefined) {
        // `response.ok` が true の時点で成功レスポンスに絞られているが、型引数
        // TResponse のままでは TS が絞り込めないため、ここだけ明示的に変換する。
        const body = (await response.json()) as SuccessBodyOf<TResponse>;
        await options.onSuccess(body);
      } else if (options.onSuccessWithoutBody !== undefined) {
        await options.onSuccessWithoutBody();
      }
    } catch {
      if (!silent) {
        setErrorMessage(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      if (!silent) {
        removePendingKey(key);
      }
    }
  }

  return {
    pending: pendingKeys.size > 0,
    errorMessage,
    setErrorMessage,
    isPending: (key: string) => pendingKeys.has(key),
    run,
  };
}
