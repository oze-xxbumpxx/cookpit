'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { ShoppingItemDto } from '@cookpit/application';
import { client } from '@/lib/api-client';
import {
  bumpAttempts,
  deleteCheckedOp,
  enqueueCheckedOp,
  listCheckedOps,
  type QueuedCheckedOp,
} from './checked-sync-queue';

/** エンキューから 24 時間で破棄する（P-7）。 */
const TTL_MS = 24 * 60 * 60 * 1000;
/** 再送の試行上限（P-7）。 */
const MAX_ATTEMPTS = 5;

interface EnqueueInput {
  shoppingListId: string;
  itemId: string;
  checked: boolean;
}

interface UseCheckedSyncQueueParams {
  items: ShoppingItemDto[];
  setItems: Dispatch<SetStateAction<ShoppingItemDto[]>>;
  shoppingListId: string;
  /**
   * flush が 422（E-01）または attempts 上限超過（E-04）でエントリを破棄したときに呼ばれる。
   * 呼び出し側でエラーバナーの表示に使う。
   */
  onQueueError: (kind: 'rejected' | 'exhausted') => void;
}

export interface UseCheckedSyncQueueResult {
  /** 現在キューに残っている itemId の集合（行の「未同期」表示に使う。P-6）。 */
  pendingItemIds: ReadonlySet<string>;
  /**
   * ネットワーク例外時にキューへ積むコールバック。handleSetChecked から呼ぶ。
   *
   * @returns 実際にキューへ積めた場合は true。IndexedDB が使えない環境（E-06）では
   *   false を返す。呼び出し側はこの戻り値で「新しいオフライン経路に入るか、従来どおりの
   *   即時エラー表示にフォールバックするか」を判定する（設計書 §エラー処理 (e) の
   *   「キューが使える場合のみ新経路に入る」ガードを、この戻り値で実現する。
   *   Orchestrator 確定要求 2 の解決策）。
   */
  enqueue: (input: EnqueueInput) => Promise<boolean>;
  /** online / focus / mount から呼ぶ。キューを再送し、成功分を items へ反映する。 */
  flush: () => Promise<void>;
}

export function useCheckedSyncQueue({
  items,
  setItems,
  shoppingListId,
  onQueueError,
}: UseCheckedSyncQueueParams): UseCheckedSyncQueueResult {
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const flushingRef = useRef(false);

  const refreshPendingItemIds = useCallback(async () => {
    try {
      const ops = await listCheckedOps();
      const ids = ops
        .filter(
          (op) =>
            op.shoppingListId === shoppingListId && items.some((item) => item.id === op.itemId),
        )
        .map((op) => op.itemId);
      setPendingItemIds(new Set(ids));
    } catch {
      // E-06: IndexedDB が使えない環境では「未同期」表示を出せないだけで致命的ではない。
    }
  }, [items, shoppingListId]);

  const enqueue = useCallback(
    async (input: EnqueueInput): Promise<boolean> => {
      try {
        await enqueueCheckedOp({
          key: `${input.shoppingListId}:${input.itemId}`,
          shoppingListId: input.shoppingListId,
          itemId: input.itemId,
          checked: input.checked,
        });
        await refreshPendingItemIds();
        return true;
      } catch {
        // E-06: キューが使えない。false を返し、呼び出し側のフォールバックに委ねる。
        return false;
      }
    },
    [refreshPendingItemIds],
  );

  const handleRetryableFailure = useCallback(
    async (op: QueuedCheckedOp) => {
      if (op.attempts + 1 >= MAX_ATTEMPTS) {
        await deleteCheckedOp(op.key).catch(() => {});
        onQueueError('exhausted');
        return;
      }
      await bumpAttempts(op.key).catch(() => {});
    },
    [onQueueError],
  );

  const flush = useCallback(async () => {
    // 短時間の二重発火（online と focus がほぼ同時等）を無駄打ちしないためのローカルな排他制御
    // （SetItemCheckedUseCase 自体は冪等なので安全側だが、無駄なリクエストを避ける。P-3）。
    if (flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    try {
      let ops: QueuedCheckedOp[];
      try {
        ops = await listCheckedOps();
      } catch {
        return; // E-06
      }
      for (const op of ops) {
        if (Date.now() - op.enqueuedAt > TTL_MS) {
          await deleteCheckedOp(op.key).catch(() => {}); // E-05
          continue;
        }

        let response;
        try {
          response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
            param: { id: op.shoppingListId, itemId: op.itemId },
            json: { checked: op.checked },
          });
        } catch {
          await handleRetryableFailure(op); // E-03
          continue;
        }

        if (response.ok) {
          try {
            const updated: ShoppingItemDto = await response.json();
            await deleteCheckedOp(op.key);
            setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          } catch {
            // 200 だが本文の解析に失敗。成功と確定できないため再送対象として残す
            // （handleSetChecked と同じ理由。「補った論点」1 を参照。試験計画 UOQ-14）。
            await handleRetryableFailure(op);
          }
          continue;
        }

        // Hono RPC の型は 404/422 を知らないため number へ広げる
        // （shopping-list-client.tsx の handleRemoveItem と同じ理由）。
        const status: number = response.status;
        if (status === 404) {
          await deleteCheckedOp(op.key).catch(() => {}); // E-02: エラー表示なし
          continue;
        }
        if (status === 422) {
          await deleteCheckedOp(op.key).catch(() => {});
          onQueueError('rejected'); // E-01
          continue;
        }
        // 5xx はネットワーク例外と同様に一時的な障害とみなす（P-5）。
        await handleRetryableFailure(op);
      }
      await refreshPendingItemIds();
    } finally {
      flushingRef.current = false;
    }
  }, [handleRetryableFailure, onQueueError, refreshPendingItemIds, setItems]);

  return { pendingItemIds, enqueue, flush };
}
