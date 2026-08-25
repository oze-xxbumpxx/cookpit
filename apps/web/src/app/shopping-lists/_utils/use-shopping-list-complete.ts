'use client';

import { client } from '@/lib/api-client';
import { useApiAction } from '@/lib/use-api-action';
import type { ShoppingItemDto, ShoppingListDto, StockAdditionInputDto } from '@cookpit/application';
import { useState } from 'react';

interface UseShoppingListCompleteParams {
  shoppingList: ShoppingListDto;
  boughtItems: ShoppingItemDto[];
}

/**
 * 買い物完了・再開の状態と操作。品目操作とは独立したバナー / パネルを持つ。
 */
export function useShoppingListComplete({
  shoppingList,
  boughtItems,
}: UseShoppingListCompleteParams) {
  const [status, setStatus] = useState(shoppingList.status);
  const [completeSuccess, setCompleteSuccess] = useState(false);
  const [completePanelOpen, setCompletePanelOpen] = useState(false);
  const [addedStockCount, setAddedStockCount] = useState(0);

  const completeAction = useApiAction();
  const reopenAction = useApiAction();

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
    completeSuccess,
    completePanelOpen,
    setCompletePanelOpen,
    addedStockCount,
    completeAction,
    reopenAction,
    handleComplete,
    handleCompleteRequest,
    handleReopen,
  };
}
