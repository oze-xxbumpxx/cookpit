'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { API_FAILURE_MESSAGE, NETWORK_ERROR_MESSAGE, useApiAction } from '@/lib/use-api-action';
import type { ShoppingItemDto, ShoppingListDto, StoreDto } from '@cookpit/application';
import { EmptyState } from '@/app/_components/empty-state';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useEffect, useOptimistic, useState } from 'react';
import { formatShoppingDate, groupItemsByStore } from '../_utils/shopping-list-view';
import { AddItemForm, type AddItemFormInput } from './add-item-form';
import { StoreGroup } from './store-group';

interface Props {
  shoppingList: ShoppingListDto;
  stores: StoreDto[];
}

/** 品目追加・再取得を表す実行中キー（品目行の操作は itemId をキーにする）。 */
const ADD_KEY = 'add';
const REFRESH_KEY = 'refresh';

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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  // 品目の楽観的更新（check / markAsBought）は状態更新の順序自体が挙動になるため
  // useApiAction に寄せず、この state と startTransition のまま維持する。
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [status, setStatus] = useState(shoppingList.status);
  const [completeSuccess, setCompleteSuccess] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // 品目の追加・再取得は同じエラーバナーを共有する。完了・再開・同期はそれぞれ独立した
  // バナーを持つため別インスタンスにする。
  const itemsAction = useApiAction();
  const completeAction = useApiAction();
  const reopenAction = useApiAction();
  const syncAction = useApiAction();

  async function handleSync(): Promise<void> {
    setSyncMessage(null);
    await syncAction.run(
      () => client.api['shopping-lists'][':id'].sync.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          const addedCount = dto.items.length - items.length;
          setItems(dto.items);
          setSyncMessage(
            addedCount > 0
              ? `${addedCount}件の材料を追加しました`
              : '追加する材料はありませんでした',
          );
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
          setItems(dto.items);
          // 再同期に成功したら過去の書き込み失敗のバナーは古い情報になるため消す
          itemsAction.setErrorMessage(null);
        },
      },
    );
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
    itemsAction.setErrorMessage(null);
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
          itemsAction.setErrorMessage(API_FAILURE_MESSAGE);
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
          itemsAction.setErrorMessage(API_FAILURE_MESSAGE);
          return;
        }
        const updated: ShoppingItemDto = await response.json();
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        if (!checked) {
          // チェックを外したら展開中の価格フォームも閉じる（誤操作防止。設計書 §フロントエンド設計）
          setExpandedItemId((current) => (current === itemId ? null : current));
        }
      } catch {
        itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE);
      } finally {
        setSubmittingItemId(null);
      }
    });
  }

  async function handleAddItem(input: AddItemFormInput): Promise<void> {
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

  async function handleComplete(): Promise<void> {
    await completeAction.run(
      () => client.api['shopping-lists'][':id'].complete.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          setStatus(dto.status);
          setCompleteSuccess(true);
        },
      },
    );
  }

  async function handleReopen(): Promise<void> {
    await reopenAction.run(
      () => client.api['shopping-lists'][':id'].reopen.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          setStatus(dto.status);
          // 再開したので「完了しました」バナーは消す。以降は追加・チェックが再び可能になる。
          setCompleteSuccess(false);
        },
      },
    );
  }

  const groupedItems = groupItemsByStore(optimisticItems, stores);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <Link
              href="/meal-plans"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9 px-2')}
            >
              戻る
            </Link>
          </div>
          <h1 className="truncate text-center text-xl font-semibold text-foreground">
            {formatShoppingDate(shoppingList.shoppingDate)}
          </h1>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRefetch({ silent: false })}
              disabled={itemsAction.isPending(REFRESH_KEY)}
              className="h-9 px-2 text-foreground"
            >
              更新
            </Button>
          </div>
        </header>

        {itemsAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {itemsAction.errorMessage}
          </p>
        )}

        {status === 'active' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSync()}
              disabled={syncAction.pending}
              className="h-11 w-full"
            >
              献立の変更を反映
            </Button>
            {syncMessage !== null && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {syncMessage}
              </p>
            )}
            {syncAction.errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {syncAction.errorMessage}
              </p>
            )}
            <Button
              type="button"
              onClick={() => void handleComplete()}
              disabled={completeAction.pending}
              className="h-11 w-full"
            >
              買い物完了
            </Button>
          </>
        )}

        {completeAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {completeAction.errorMessage}
          </p>
        )}

        {status === 'completed' && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleReopen()}
            disabled={reopenAction.pending}
            className="h-11 w-full"
          >
            買い物を再開
          </Button>
        )}

        {reopenAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {reopenAction.errorMessage}
          </p>
        )}

        {completeSuccess && (
          <div className="rounded-lg border bg-secondary px-3 py-2 text-sm text-foreground">
            <p>買い物を完了しました</p>
            <Link
              href="/pantry"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-9 px-2 text-foreground',
              )}
            >
              在庫を見る
            </Link>
          </div>
        )}

        {optimisticItems.length === 0 ? (
          <EmptyState Icon={ShoppingCart} message="リストにアイテムがありません" />
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
                onSetChecked={handleSetChecked}
                onMarkAsBought={handleMarkAsBought}
                onReassignStore={(itemId, targetStoreId) =>
                  void handleReassignStore(itemId, targetStoreId)
                }
                stores={stores}
              />
            ))}
          </div>
        )}

        {status === 'active' &&
          (addFormOpen ? (
            <AddItemForm
              stores={stores}
              submitting={itemsAction.isPending(ADD_KEY)}
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
          ))}
      </div>
    </main>
  );
}
