'use client';

import { client } from '@/lib/api-client';
import {
  API_FAILURE_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  type ApiAction,
} from '@/lib/use-api-action';
import type { ShoppingItemDto } from '@cookpit/application';
import {
  startTransition,
  useOptimistic,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** 品目追加を表す実行中キー（品目行の操作は itemId をキーにする）。 */
export const ADD_KEY = 'add';

/** 手動追加フォームの入力（`AddItemForm` の出力と同型）。 */
export interface AddItemInput {
  displayName: string;
  requiredAmount: { value: number; unit: string };
  targetStoreId: string | null;
}

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

interface EnqueueInput {
  shoppingListId: string;
  itemId: string;
  checked: boolean;
}

export interface UseShoppingListItemMutationsParams {
  shoppingListId: string;
  items: ShoppingItemDto[];
  setItems: Dispatch<SetStateAction<ShoppingItemDto[]>>;
  /** 品目の追加・再取得とエラーバナーを共有する（完了・再開・同期は別インスタンス）。 */
  itemsAction: ApiAction;
  enqueue: (input: EnqueueInput) => Promise<boolean>;
}

export interface UseShoppingListItemMutationsResult {
  optimisticItems: ShoppingItemDto[];
  expandedItemId: string | null;
  addFormOpen: boolean;
  setAddFormOpen: Dispatch<SetStateAction<boolean>>;
  submittingItemId: string | null;
  pendingRemoveItem: ShoppingItemDto | null;
  setPendingRemoveItem: Dispatch<SetStateAction<ShoppingItemDto | null>>;
  handleMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  handleSetChecked: (itemId: string, checked: boolean) => void;
  handleRequestRemove: (itemId: string) => void;
  handleRemoveItem: (itemId: string) => void;
  handleAddItem: (input: AddItemInput) => Promise<void>;
  handleReassignStore: (itemId: string, targetStoreId: string) => Promise<void>;
  handleToggleExpand: (itemId: string) => void;
}

/**
 * 品目単位の操作（check / bought / remove / add / reassign / expand）と楽観的更新。
 * リスト全体の status・sync・complete は {@link useShoppingListLifecycle} 側。
 */
export function useShoppingListItemMutations({
  shoppingListId,
  items,
  setItems,
  itemsAction,
  enqueue,
}: UseShoppingListItemMutationsParams): UseShoppingListItemMutationsResult {
  const [optimisticItems, setOptimisticItems] = useOptimistic(items, applyOptimisticAction);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  // 品目の楽観的更新（check / markAsBought）は状態更新の順序自体が挙動になるため
  // useApiAction に寄せず、この state と startTransition のまま維持する。
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<ShoppingItemDto | null>(null);

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
          param: { id: shoppingListId, itemId },
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
          param: { id: shoppingListId, itemId },
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
        const queued = await enqueue({ shoppingListId, itemId, checked });
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
          param: { id: shoppingListId, itemId },
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
          param: { id: shoppingListId },
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
            param: { id: shoppingListId, itemId },
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
    optimisticItems,
    expandedItemId,
    addFormOpen,
    setAddFormOpen,
    submittingItemId,
    pendingRemoveItem,
    setPendingRemoveItem,
    handleMarkAsBought,
    handleSetChecked,
    handleRequestRemove,
    handleRemoveItem,
    handleAddItem,
    handleReassignStore,
    handleToggleExpand,
  };
}
