'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface LeaveConfirmation {
  /** 確認ダイアログの open。`AlertDialog` の `open` に渡す。 */
  confirmOpen: boolean;
  /** `AlertDialog` の `onOpenChange` に渡す。false で「編集を続ける」と同じ扱いになる。 */
  onConfirmOpenChange: (open: boolean) => void;
  /** 画面内のキャンセルボタンから呼ぶ。dirty でなければ確認せず即遷移する。 */
  requestLeave: (href: string) => void;
  /** ダイアログの「戻る」から呼ぶ。ガードを解除して離脱する。 */
  confirmLeave: () => void;
  /**
   * 保存成功時に呼ぶ。ガードを解除してから遷移するため確認ダイアログが出ない。
   * `router.refresh()` が必要なら呼び出し側で続けて呼ぶ。
   */
  leaveAfterSave: (href: string) => void;
}

interface Options {
  /** 未保存の変更があるか。false のときガードは一切働かない。 */
  dirty: boolean;
  /** ブラウザバック起因の離脱で遷移する先。画面内キャンセルと同じ遷移先を渡す。 */
  fallbackHref: string;
}

/**
 * 未保存の変更があるまま画面を離れようとしたときに確認を挟む。
 *
 * 不変条件を 1 つだけ持つ: **dirty が true の間は履歴にダミーエントリ（sentinel）が
 * ちょうど 1 段積まれている**。これを冪等な `ensureSentinel` で維持することで、
 * popstate 由来かキャンセル由来かを区別せずに履歴の整合を保つ。
 *
 * 捕捉できる離脱経路は (1) 画面内のキャンセル、(2) ブラウザ / スワイプの戻る、
 * (3) `<a>`（ボトムナビの `next/link` を含む）のクリック の 3 つ。
 * コード内の `router.push` / `router.replace` とリロード・タブを閉じる操作は捕捉しない。
 */
export function useLeaveConfirmation({ dirty, fallbackHref }: Options): LeaveConfirmation {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sentinelPushed = useRef(false);
  const released = useRef(false);
  // イベントハンドラは登録時のクロージャを保持するため、最新の dirty は ref 経由で読む。
  const dirtyRef = useRef(dirty);
  const fallbackHrefRef = useRef(fallbackHref);

  const ensureSentinel = useCallback((): void => {
    if (!dirtyRef.current || sentinelPushed.current || released.current) {
      return;
    }
    // 同じ URL を明示指定して積む。URL が変わらないのでルートは不変で、フォームの state も残る。
    window.history.pushState(null, '', window.location.href);
    sentinelPushed.current = true;
  }, []);

  const navigate = useCallback(
    (href: string): void => {
      released.current = true;
      if (sentinelPushed.current) {
        // sentinel が残っているならそれを遷移先で置き換え、余分な履歴を残さない。
        sentinelPushed.current = false;
        router.replace(href);
        return;
      }
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    dirtyRef.current = dirty;
    fallbackHrefRef.current = fallbackHref;
    ensureSentinel();
  }, [dirty, fallbackHref, ensureSentinel]);

  useEffect(() => {
    function handlePopState(): void {
      if (released.current || !dirtyRef.current || !sentinelPushed.current) {
        return;
      }
      // sentinel が 1 段消費された。URL は sentinel と同一なので画面は変わっていない。
      sentinelPushed.current = false;
      setPendingHref(fallbackHrefRef.current);
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    // capture フェーズで止めて Next の Link の内部ハンドラへ到達させない。
    // 登録先は document ではなく **window**。Next.js App Router は `document` を React の
    // ルートコンテナにしてハイドレートするため、React の capture リスナも `document` に付く。
    // 同一ノードのリスナは登録順に走り、ハイドレートはこの useEffect より先に終わっているので、
    // document に付けると Link の onClick が先に走って遷移してしまう（実機確認 E-5 で検出）。
    // capture の伝播は window → document の順なので、window なら確実に先取りできる。
    function handleClick(event: MouseEvent): void {
      if (released.current || !dirtyRef.current) {
        return;
      }
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      // SVG アイコンを含むリンク（ボトムナビのタブ）ではクリック対象が SVGElement になる。
      // HTMLElement で判定すると素通りするため Element で受ける（closest は両方が持つ）。
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target === '_blank' || anchor.origin !== window.location.origin) {
        return;
      }
      if (anchor.href === window.location.href) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    }
    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('click', handleClick, true);
    };
  }, []);

  function onConfirmOpenChange(open: boolean): void {
    if (open) {
      return;
    }
    setPendingHref(null);
    // popstate で消費されていれば積み直す。消費されていなければ何もしない（冪等）。
    ensureSentinel();
  }

  function requestLeave(href: string): void {
    if (!dirty) {
      navigate(href);
      return;
    }
    setPendingHref(href);
  }

  function confirmLeave(): void {
    const href = pendingHref ?? fallbackHref;
    setPendingHref(null);
    navigate(href);
  }

  return {
    confirmOpen: pendingHref !== null,
    onConfirmOpenChange,
    requestLeave,
    confirmLeave,
    leaveAfterSave: navigate,
  };
}
