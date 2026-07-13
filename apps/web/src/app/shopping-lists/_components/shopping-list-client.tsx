'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ShoppingItemDto, ShoppingListDto, StoreDto } from '@cookpit/application';
import Link from 'next/link';
import { startTransition, useEffect, useOptimistic, useState } from 'react';
import { formatShoppingDate, groupItemsByStore } from '../_utils/shopping-list-view';
import { AddItemForm, type AddItemFormInput } from './add-item-form';
import { StoreGroup } from './store-group';

interface Props {
  shoppingList: ShoppingListDto;
  stores: StoreDto[];
}

interface OptimisticAction {
  itemId: string;
  patch: Partial<ShoppingItemDto>;
}

function applyOptimisticPatch(
  current: ShoppingItemDto[],
  action: OptimisticAction,
): ShoppingItemDto[] {
  return current.map((item) => (item.id === action.itemId ? { ...item, ...action.patch } : item));
}

/** 詳細画面の状態管理・全体統括（Client。S-4/D-7）。 */
export function ShoppingListClient({ shoppingList, stores }: Props) {
  const [items, setItems] = useState<ShoppingItemDto[]>(shoppingList.items);
  const [optimisticItems, setOptimisticItems] = useOptimistic(items, applyOptimisticPatch);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefetch({ silent }: { silent: boolean }): Promise<void> {
    setRefreshing(true);
    try {
      const response = await client.api['shopping-lists'][':id'].$get({
        param: { id: shoppingList.id },
      });
      if (!response.ok) {
        if (!silent) {
          setErrorMessage('操作に失敗しました。');
        }
        return;
      }
      const dto = await response.json();
      setItems(dto.items);
    } catch {
      if (!silent) {
        setErrorMessage('通信エラーが発生しました。');
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    function handleFocus(): void {
      void handleRefetch({ silent: true });
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMarkAsBought(itemId: string, actualPrice: number, actualStoreId: string): void {
    if (submittingItemId === itemId) {
      return;
    }
    // submittingItemId は startTransition の外（通常優先度）で更新する。transition 内の
    // 通常の setState は非同期処理が完了するまで反映が保留されるため（useOptimistic のみが
    // 即時反映される）、ここで先に更新しないと「操作中 item のみ disable」が機能しない。
    setSubmittingItemId(itemId);
    setErrorMessage(null);
    startTransition(async () => {
      setOptimisticItems({
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
          setErrorMessage('操作に失敗しました。');
          return;
        }
        const updated: ShoppingItemDto = await response.json();
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setExpandedItemId(null);
      } catch {
        setErrorMessage('通信エラーが発生しました。');
      } finally {
        setSubmittingItemId(null);
      }
    });
  }

  async function handleAddItem(input: AddItemFormInput): Promise<void> {
    setAddSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api['shopping-lists'][':id'].items.$post({
        param: { id: shoppingList.id },
        json: { ...input, productId: null },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const created: ShoppingItemDto = await response.json();
      setItems((current) => [...current, created]);
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleReassignStore(itemId: string, targetStoreId: string): Promise<void> {
    if (submittingItemId === itemId) {
      return;
    }
    setSubmittingItemId(itemId);
    setErrorMessage(null);
    try {
      const response = await client.api['shopping-lists'][':id'].items[':itemId'][
        'target-store'
      ].$post({
        param: { id: shoppingList.id, itemId },
        json: { targetStoreId },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const updated: ShoppingItemDto = await response.json();
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmittingItemId(null);
    }
  }

  function handleToggleExpand(itemId: string): void {
    setExpandedItemId((current) => (current === itemId ? null : itemId));
  }

  const groupedItems = groupItemsByStore(optimisticItems, stores);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <Link
              href="/meal-plans"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-9 px-2 text-foreground',
              )}
            >
              戻る
            </Link>
          </div>
          <h1 className="truncate text-center text-lg font-semibold text-foreground">
            {formatShoppingDate(shoppingList.shoppingDate)}
          </h1>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRefetch({ silent: false })}
              disabled={refreshing}
              className="h-9 px-2 text-foreground"
            >
              更新
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {optimisticItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            リストにアイテムがありません
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groupedItems.map((group) => (
              <StoreGroup
                key={group.storeId ?? 'unassigned'}
                storeId={group.storeId}
                storeName={group.storeName}
                items={group.items}
                expandedItemId={expandedItemId}
                submittingItemId={submittingItemId}
                onToggleExpand={handleToggleExpand}
                onMarkAsBought={handleMarkAsBought}
                onReassignStore={(itemId, targetStoreId) =>
                  void handleReassignStore(itemId, targetStoreId)
                }
                stores={stores}
              />
            ))}
          </div>
        )}

        {addFormOpen ? (
          <AddItemForm
            stores={stores}
            submitting={addSubmitting}
            onAdd={(input) => void handleAddItem(input)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddFormOpen(true)}
            className="h-11 w-full"
          >
            手動で追加
          </Button>
        )}
      </div>
    </main>
  );
}
