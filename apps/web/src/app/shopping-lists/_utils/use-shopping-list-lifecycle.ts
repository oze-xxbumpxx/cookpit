'use client';

import { client } from '@/lib/api-client';
import { useApiAction, type ApiAction } from '@/lib/use-api-action';
import type {
  CoveredIngredientDto,
  ShoppingItemDto,
  ShoppingListDto,
  StockAdditionInputDto,
} from '@cookpit/application';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { describeSyncResult, diffSyncResult } from './shopping-list-view';

/** 品目再取得を表す実行中キー。 */
export const REFRESH_KEY = 'refresh';

export interface UseShoppingListLifecycleParams {
  shoppingList: ShoppingListDto;
  items: ShoppingItemDto[];
  setItems: Dispatch<SetStateAction<ShoppingItemDto[]>>;
  /** 品目の追加・再取得とエラーバナーを共有する。 */
  itemsAction: ApiAction;
  flush: () => Promise<void>;
  pendingItemIds: ReadonlySet<string>;
}

export interface UseShoppingListLifecycleResult {
  status: ShoppingListDto['status'];
  coveredIngredients: CoveredIngredientDto[] | null;
  syncMessage: string | null;
  completeSuccess: boolean;
  completePanelOpen: boolean;
  setCompletePanelOpen: Dispatch<SetStateAction<boolean>>;
  addedStockCount: number;
  boughtItems: ShoppingItemDto[];
  completeAction: ApiAction;
  reopenAction: ApiAction;
  syncAction: ApiAction;
  handleSync: () => Promise<void>;
  handleRefetch: (options: { silent: boolean }) => Promise<void>;
  handleComplete: (stockAdditions: StockAdditionInputDto[]) => Promise<void>;
  handleCompleteRequest: () => void;
  handleReopen: () => Promise<void>;
}

/**
 * リスト単位のライフサイクル（status / sync / refetch / complete / reopen）と
 * flush・focus・online の副作用。品目操作は {@link useShoppingListItemMutations} 側。
 */
export function useShoppingListLifecycle({
  shoppingList,
  items,
  setItems,
  itemsAction,
  flush,
  pendingItemIds,
}: UseShoppingListLifecycleParams): UseShoppingListLifecycleResult {
  const [coveredIngredients, setCoveredIngredients] = useState<CoveredIngredientDto[] | null>(
    shoppingList.coveredIngredients,
  );
  const [status, setStatus] = useState(shoppingList.status);
  const [completeSuccess, setCompleteSuccess] = useState(false);
  const [completePanelOpen, setCompletePanelOpen] = useState(false);
  const [addedStockCount, setAddedStockCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const completeAction = useApiAction();
  const reopenAction = useApiAction();
  const syncAction = useApiAction();

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

  async function handleComplete(stockAdditions: StockAdditionInputDto[]): Promise<void> {
    await completeAction.run(
      () =>
        client.api['shopping-lists'][':id'].complete.$post({
          param: { id: shoppingList.id },
          json: { stockAdditions },
        }),
      {
        onSuccess: (dto) => {
          setStatus(dto.status);
          setCompleteSuccess(true);
          setAddedStockCount(stockAdditions.length);
          setCompletePanelOpen(false);
        },
      },
    );
    // 失敗時はパネルを開いたままにする（入力を失わず再送できる）。
  }

  /** 在庫化の候補が無ければ選択パネルを挟まず完了する。 */
  function handleCompleteRequest(): void {
    if (boughtItems.length === 0) {
      void handleComplete([]);
      return;
    }
    setCompletePanelOpen(true);
  }

  async function handleReopen(): Promise<void> {
    await reopenAction.run(
      () => client.api['shopping-lists'][':id'].reopen.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          setStatus(dto.status);
          // 再開したので「完了しました」バナーは消す。以降は追加・チェックが再び可能になる。
          setCompleteSuccess(false);
          setAddedStockCount(0);
        },
      },
    );
  }

  return {
    status,
    coveredIngredients,
    syncMessage,
    completeSuccess,
    completePanelOpen,
    setCompletePanelOpen,
    addedStockCount,
    boughtItems,
    completeAction,
    reopenAction,
    syncAction,
    handleSync,
    handleRefetch,
    handleComplete,
    handleCompleteRequest,
    handleReopen,
  };
}
