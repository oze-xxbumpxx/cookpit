'use client';

import { client } from '@/lib/api-client';
import { API_FAILURE_MESSAGE, NETWORK_ERROR_MESSAGE, useApiAction } from '@/lib/use-api-action';
import type { CoveredIngredientDto, ShoppingItemDto, ShoppingListDto } from '@cookpit/application';
import { startTransition, useEffect, useOptimistic, useRef, useState } from 'react';
import { describeSyncResult, diffSyncResult } from './shopping-list-view';
import { useCheckedSyncQueue } from './use-checked-sync-queue';

/** 手動追加フォームと同じ形（_components への依存を避けるためここに型だけ置く）。 */
interface AddItemInput {
  displayName: string;
  requiredAmount: { value: number; unit: string };
  targetStoreId: string | null;
}

/** 品目追加・再取得を表す実行中キー（品目行の操作は itemId をキーにする）。 */
const ADD_KEY = 'add';
const REFRESH_KEY = 'refresh';

/** 完了済みリストへの変更をサーバーが拒否したとき（422）の文言。 */
const COMPLETED_REJECTED_MESSAGE = '買い物完了後は変更できません。「買い物を再開」してください。';

/**
 * 品目操作の失敗文言。完了済みリストでは UI 側でも操作を止めているが、2 人で使っていて
 * 相手が先に「買い物完了」した直後は自分の画面がまだ active のままで 422 が返り得るため、
 * そのときだけ回復手段を示す。
 */
function resolveItemFailureMessage(status: number): string {
  return status === 422 ? COMPLETED_REJECTED_MESSAGE : API_FAILURE_MESSAGE;
}

/** キューに残っている未同期の変更がある間、画面上部に表示する案内文（P-6）。 */
export const OFFLINE_QUEUE_BANNER_MESSAGE =
  'オフライン中の変更があります。オンラインになると自動的に送信されます。';

/** キューの再送が上限回数に達し同期を断念したときの文言（E-04）。 */
const QUEUE_SYNC_FAILED_MESSAGE =
  '同期できなかった変更があります。品目を確認し、もう一度操作してください。';

/**
 * 楽観的更新の操作。行の削除は `map` によるパッチでは表現できないため判別可能ユニオンにする。
 * `type` を判別子にすることで、新しい操作を足したときの分岐漏れが型エラーになる。
 */
type OptimisticAction =
  | { type: 'patch'; itemId: string; patch: Partial<ShoppingItemDto> }
  | { type: 'remove'; itemId: string };

function applyOptimisticAction(
  current: ShoppingItemDto[],
  action: OptimisticAction,
): ShoppingItemDto[] {
  if (action.type === 'remove') {
    return current.filter((item) => item.id !== action.itemId);
  }
  return current.map((item) => (item.id === action.itemId ? { ...item, ...action.patch } : item));
}

interface UseShoppingListItemsParams {
  shoppingList: ShoppingListDto;
}

/**
 * 買い物リスト詳細の品目状態・操作・Sync / refetch・オフラインキュー配線。
 * 楽観的更新の順序とキュー優先マージはここに閉じる（挙動不変の分割）。
 */
export function useShoppingListItems({ shoppingList }: UseShoppingListItemsParams) {
  const [items, setItems] = useState<ShoppingItemDto[]>(shoppingList.items);
  const [coveredIngredients, setCoveredIngredients] = useState<CoveredIngredientDto[] | null>(
    shoppingList.coveredIngredients,
  );
  const [optimisticItems, setOptimisticItems] = useOptimistic(items, applyOptimisticAction);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  // 品目の楽観的更新（check / markAsBought）は状態更新の順序自体が挙動になるため
  // useApiAction に寄せず、この state と startTransition のまま維持する。
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<ShoppingItemDto | null>(null);

  // 品目の追加・再取得は同じエラーバナーを共有する。完了・再開・同期はそれぞれ独立した
  // バナーを持つため別インスタンスにする。
  const itemsAction = useApiAction();
  const syncAction = useApiAction();

  function handleQueueError(kind: 'rejected' | 'exhausted'): void {
    itemsAction.setErrorMessage(
      kind === 'rejected' ? COMPLETED_REJECTED_MESSAGE : QUEUE_SYNC_FAILED_MESSAGE,
    );
  }

  const { pendingItemIds, enqueue, flush } = useCheckedSyncQueue({
    items,
    setItems,
    shoppingListId: shoppingList.id,
    onQueueError: handleQueueError,
  });
  // online/focus/mount 用の useEffect は依存配列を空にする既存パターン（handleFocus）を踏襲する
  // ため、`items` の変化で再生成される pendingItemIds/flush の最新値は ref 経由で読む
  // （stale closure 対策。reviewer Should 2）。
  const pendingItemIdsRef = useRef<ReadonlySet<string>>(pendingItemIds);
  useEffect(() => {
    pendingItemIdsRef.current = pendingItemIds;
  }, [pendingItemIds]);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // 在庫化の候補は購入済みの品目のみ。楽観的更新中の値ではなく確定済みの items から取る。
  const boughtItems = items.filter((item) => item.status === 'bought');

  async function handleSync(): Promise<void> {
    setSyncMessage(null);
    await syncAction.run(
      () => client.api['shopping-lists'][':id'].sync.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          const diff = diffSyncResult(items, dto.items);
          setItems(dto.items);
          setCoveredIngredients(dto.coveredIngredients);
          setSyncMessage(describeSyncResult(diff));
        },
      },
    );
  }

  async function handleRefetch({ silent }: { silent: boolean }): Promise<void> {
    await itemsAction.run(
      () => client.api['shopping-lists'][':id'].$get({ param: { id: shoppingList.id } }),
      {
        key: REFRESH_KEY,
        silent,
        onSuccess: (dto) => {
          // キューに残っている（未同期の）itemId はサーバー値で上書きせず、ローカルの
          // 未同期値を優先する（P-4。flush が未完了のままサーバー応答を受けたときの
          // データロス防止）。
          setItems((current) =>
            dto.items.map((serverItem) =>
              pendingItemIdsRef.current.has(serverItem.id)
                ? (current.find((c) => c.id === serverItem.id) ?? serverItem)
                : serverItem,
            ),
          );
          setCoveredIngredients(dto.coveredIngredients);
          // 再同期に成功したら過去の書き込み失敗のバナーは古い情報になるため消す
          itemsAction.setErrorMessage(null);
        },
      },
    );
  }

  useEffect(() => {
    function handleFocus(): void {
      void (async () => {
        // キュー再送を先に完了させてから refetch する（P-4）。順序を逆にすると
        // handleRefetch の onSuccess が未送信のローカル変更をサーバーの古い値で
        // 上書きしてしまう（データロス）。
        await flushRef.current();
        await handleRefetch({ silent: true });
      })();
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleOnline(): void {
      void flushRef.current();
    }
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    // マウント時に 1 度キューの再送を試みる（FR-5, N-06）。オフラインのままなら
    // flush 内部の catch で attempts が増えるだけで実害はない。IndexedDB が未実装の
    // 環境（checked-sync-queue.ts のガード）でも flush() は例外を投げず即座に戻る。
    void flushRef.current();
  }, []);

  function handleMarkAsBought(itemId: string, actualPrice: number, actualStoreId: string): void {
    if (submittingItemId === itemId) {
      return;
    }
    // submittingItemId は startTransition の外（通常優先度）で更新する。transition 内の
    // 通常の setState は非同期処理が完了するまで反映が保留されるため（useOptimistic のみが
    // 即時反映される）、ここで先に更新しないと「操作中 item のみ disable」が機能しない。
    setSubmittingItemId(itemId);
    itemsAction.setErrorMessage(null);
    startTransition(async () => {
      setOptimisticItems({
        type: 'patch',
        itemId,
        patch: {
          status: 'bought',
          actualPrice: { amount: actualPrice, currency: 'JPY' },
          actualStoreId,
        },
      });
      try {
        const response = await client.api['shopping-lists'][':id'].items[':itemId'].bought.$post({
          param: { id: shoppingList.id, itemId },
          json: { actualPrice: { amount: actualPrice, currency: 'JPY' }, actualStoreId },
        });
        if (!response.ok) {
          itemsAction.setErrorMessage(resolveItemFailureMessage(response.status));
          return;
        }
        const updated: ShoppingItemDto = await response.json();
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setExpandedItemId(null);
      } catch {
        itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE);
      } finally {
        setSubmittingItemId(null);
      }
    });
  }

  function handleSetChecked(itemId: string, checked: boolean): void {
    if (submittingItemId === itemId) {
      return;
    }
    setSubmittingItemId(itemId);
    itemsAction.setErrorMessage(null);
    startTransition(async () => {
      setOptimisticItems({
        type: 'patch',
        itemId,
        patch: checked
          ? { status: 'bought' }
          : { status: 'pending', actualPrice: null, actualStoreId: null },
      });
      try {
        const response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
          param: { id: shoppingList.id, itemId },
          json: { checked },
        });
        if (!response.ok) {
          itemsAction.setErrorMessage(resolveItemFailureMessage(response.status));
          return;
        }
        let updated: ShoppingItemDto;
        try {
          updated = await response.json();
        } catch {
          // 200 だが本文の解析に失敗。オフラインではないためキューには積まず、
          // 既存の一般失敗表示にとどめる（response.json() の失敗を誤ってオフライン判定
          // しないための分岐。実装計画「実装計画作成時に補った論点」1）。
          itemsAction.setErrorMessage(API_FAILURE_MESSAGE);
          return;
        }
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        if (!checked) {
          // チェックを外したら展開中の価格フォームも閉じる（誤操作防止。設計書 §フロントエンド設計）
          setExpandedItemId((current) => (current === itemId ? null : current));
        }
      } catch {
        // fetch 自体の例外 = オフライン等のネットワーク例外（P-2 案B）。
        const queued = await enqueue({ shoppingListId: shoppingList.id, itemId, checked });
        if (queued) {
          // ロールバックの代わりに確定 state 側へ望む状態を直接書き込む。useOptimistic は
          // transition 終了時にこの確定値を基準に再計算されるため、チェック状態はついたまま
          // 表示され続ける（P-2 の核心）。
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
                ? checked
                  ? { ...item, status: 'bought' }
                  : { ...item, status: 'pending', actualPrice: null, actualStoreId: null }
                : item,
            ),
          );
          if (!checked) {
            setExpandedItemId((current) => (current === itemId ? null : current));
          }
        } else {
          // E-06: キューが使えない環境。従来どおりの挙動（ロールバック相当）へフォールバックする
          // （設計書 §エラー処理 (e)）。setItems を呼ばないため useOptimistic は変化していない
          // 確定 state に収束する。
          itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE);
        }
      } finally {
        setSubmittingItemId(null);
      }
    });
  }

  /** 削除の確認要求。対象は確定値の items から引く（optimisticItems は transition 中の値）。 */
  function handleRequestRemove(itemId: string): void {
    setPendingRemoveItem(items.find((item) => item.id === itemId) ?? null);
  }

  function handleRemoveItem(itemId: string): void {
    if (submittingItemId === itemId) {
      return;
    }
    // handleSetChecked と同じ理由で、submittingItemId は startTransition の外で更新する。
    setSubmittingItemId(itemId);
    itemsAction.setErrorMessage(null);
    startTransition(async () => {
      setOptimisticItems({ type: 'remove', itemId });
      try {
        const response = await client.api['shopping-lists'][':id'].items[':itemId'].$delete({
          param: { id: shoppingList.id, itemId },
        });
        // 404 は「その品目がサーバーに無い」＝削除の目的は達成済み。2 人で使っていて相手が
        // 先に消した場合にエラーを出さないよう、成功として扱う。
        // Hono RPC の型は 404 / 422 を知らない（共通 onError 由来で型に現れない）ため、
        // 比較の前に number へ広げる。
        const status: number = response.status;
        if (!response.ok && status !== 404) {
          itemsAction.setErrorMessage(resolveItemFailureMessage(response.status));
          return;
        }
        setItems((current) => current.filter((item) => item.id !== itemId));
        setExpandedItemId((current) => (current === itemId ? null : current));
      } catch {
        itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE);
      } finally {
        setSubmittingItemId(null);
      }
    });
  }

  async function handleAddItem(input: AddItemInput): Promise<void> {
    await itemsAction.run(
      () =>
        client.api['shopping-lists'][':id'].items.$post({
          param: { id: shoppingList.id },
          json: { ...input, productId: null },
        }),
      {
        key: ADD_KEY,
        onSuccess: (created) => setItems((current) => [...current, created]),
      },
    );
  }

  async function handleReassignStore(itemId: string, targetStoreId: string): Promise<void> {
    if (submittingItemId === itemId) {
      return;
    }
    setSubmittingItemId(itemId);
    try {
      await itemsAction.run(
        () =>
          client.api['shopping-lists'][':id'].items[':itemId']['target-store'].$post({
            param: { id: shoppingList.id, itemId },
            json: { targetStoreId },
          }),
        {
          key: itemId,
          failureMessage: resolveItemFailureMessage,
          onSuccess: (updated) =>
            setItems((current) => current.map((item) => (item.id === updated.id ? updated : item))),
        },
      );
    } finally {
      setSubmittingItemId(null);
    }
  }

  function handleToggleExpand(itemId: string): void {
    setExpandedItemId((current) => (current === itemId ? null : itemId));
  }

  return {
    coveredIngredients,
    optimisticItems,
    expandedItemId,
    addFormOpen,
    setAddFormOpen,
    submittingItemId,
    syncMessage,
    pendingRemoveItem,
    setPendingRemoveItem,
    itemsAction,
    syncAction,
    pendingItemIds,
    boughtItems,
    addKey: ADD_KEY,
    refreshKey: REFRESH_KEY,
    handleSync,
    handleRefetch,
    handleMarkAsBought,
    handleSetChecked,
    handleRequestRemove,
    handleRemoveItem,
    handleAddItem,
    handleReassignStore,
    handleToggleExpand,
  };
}
