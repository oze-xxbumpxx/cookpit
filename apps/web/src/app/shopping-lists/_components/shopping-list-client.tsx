'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useApiAction } from '@/lib/use-api-action';
import type { ProductDto, ShoppingListDto, StoreDto } from '@cookpit/application';
import { EmptyState } from '@/app/_components/empty-state';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  describeRemoveConfirmation,
  formatShoppingDate,
  groupItemsByStore,
} from '../_utils/shopping-list-view';
import { useCheckedSyncQueue } from '../_utils/use-checked-sync-queue';
import { ADD_KEY, useShoppingListItemMutations } from '../_utils/use-shopping-list-item-mutations';
import { REFRESH_KEY, useShoppingListLifecycle } from '../_utils/use-shopping-list-lifecycle';
import { AddItemForm } from './add-item-form';
import { CompleteShoppingPanel } from './complete-shopping-panel';
import { CoveredIngredientsSection } from './covered-ingredients-section';
import { StoreGroup } from './store-group';

interface Props {
  shoppingList: ShoppingListDto;
  stores: StoreDto[];
  products: ProductDto[];
}

/** 完了済みリストは編集できない旨の案内（画面上で操作を無効化していることの説明）。 */
const COMPLETED_GUIDANCE =
  '完了済みのリストは編集できません。変更するには「買い物を再開」してください。';

/** 完了済みリストへの変更をサーバーが拒否したとき（422）の文言。 */
const COMPLETED_REJECTED_MESSAGE = '買い物完了後は変更できません。「買い物を再開」してください。';

/** キューに残っている未同期の変更がある間、画面上部に表示する案内文（P-6）。 */
const OFFLINE_QUEUE_BANNER_MESSAGE =
  'オフライン中の変更があります。オンラインになると自動的に送信されます。';

/** キューの再送が上限回数に達し同期を断念したときの文言（E-04）。 */
const QUEUE_SYNC_FAILED_MESSAGE =
  '同期できなかった変更があります。品目を確認し、もう一度操作してください。';

/**
 * 詳細画面の状態管理・全体統括（Client。S-4/D-7）。
 * 品目操作は {@link useShoppingListItemMutations}、リスト lifecycle は
 * {@link useShoppingListLifecycle} に委譲する（構造分割のみ・挙動は不変）。
 */
export function ShoppingListClient({ shoppingList, stores, products }: Props) {
  const [items, setItems] = useState(shoppingList.items);

  // 品目の追加・再取得は同じエラーバナーを共有する。完了・再開・同期はそれぞれ独立した
  // バナーを持つため別インスタンスにする（lifecycle 内）。
  const itemsAction = useApiAction();

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

  const lifecycle = useShoppingListLifecycle({
    shoppingList,
    items,
    setItems,
    itemsAction,
    flush,
    pendingItemIds,
  });

  const mutations = useShoppingListItemMutations({
    shoppingListId: shoppingList.id,
    items,
    setItems,
    itemsAction,
    enqueue,
  });

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const groupedItems = groupItemsByStore(mutations.optimisticItems, stores);
  // 完了済みリストへの品目操作はサーバーが 422 で拒否する（ADR-0009 決定 3）。
  // UI 側でも操作できないようにし、ルールと表示を一致させる。
  const readOnly = lifecycle.status !== 'active';
  const hasCovered =
    lifecycle.coveredIngredients !== null && lifecycle.coveredIngredients.length > 0;
  const showEmptyState = mutations.optimisticItems.length === 0 && !hasCovered;

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex justify-start">
            <Link
              href="/meal-plans"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9 px-2')}
            >
              戻る
            </Link>
          </div>
          <h1 className="min-w-0 truncate text-center text-xl font-semibold text-foreground">
            {formatShoppingDate(shoppingList.shoppingDate)}
          </h1>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void lifecycle.handleRefetch({ silent: false })}
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

        {pendingItemIds.size > 0 && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {OFFLINE_QUEUE_BANNER_MESSAGE}
          </p>
        )}

        {lifecycle.status === 'active' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void lifecycle.handleSync()}
              disabled={lifecycle.syncAction.pending}
              className="h-11 w-full"
            >
              献立の変更を反映
            </Button>
            {lifecycle.syncMessage !== null && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {lifecycle.syncMessage}
              </p>
            )}
            {lifecycle.syncAction.errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {lifecycle.syncAction.errorMessage}
              </p>
            )}
            {!lifecycle.completePanelOpen && (
              <Button
                type="button"
                onClick={lifecycle.handleCompleteRequest}
                disabled={lifecycle.completeAction.pending}
                className="h-11 w-full"
              >
                買い物完了
              </Button>
            )}
            {lifecycle.completePanelOpen && (
              <CompleteShoppingPanel
                items={lifecycle.boughtItems}
                submitting={lifecycle.completeAction.pending}
                onCancel={() => lifecycle.setCompletePanelOpen(false)}
                onComplete={(stockAdditions) => void lifecycle.handleComplete(stockAdditions)}
              />
            )}
          </>
        )}

        {lifecycle.completeAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {lifecycle.completeAction.errorMessage}
          </p>
        )}

        {lifecycle.status === 'completed' && (
          <>
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {COMPLETED_GUIDANCE}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void lifecycle.handleReopen()}
              disabled={lifecycle.reopenAction.pending}
              className="h-11 w-full"
            >
              買い物を再開
            </Button>
          </>
        )}

        {lifecycle.reopenAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {lifecycle.reopenAction.errorMessage}
          </p>
        )}

        {lifecycle.completeSuccess && (
          <div className="rounded-lg border bg-secondary px-3 py-2 text-sm text-foreground">
            <p>買い物を完了しました</p>
            {lifecycle.addedStockCount > 0 && (
              <p>{lifecycle.addedStockCount}件を在庫に追加しました</p>
            )}
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

        {showEmptyState ? (
          <EmptyState Icon={ShoppingCart} message="リストにアイテムがありません" />
        ) : (
          <div className="flex flex-col gap-4">
            {groupedItems.map((group) => (
              <StoreGroup
                key={group.storeId ?? 'unassigned'}
                storeId={group.storeId}
                storeName={group.storeName}
                items={group.items}
                expandedItemId={mutations.expandedItemId}
                submittingItemId={mutations.submittingItemId}
                readOnly={readOnly}
                pendingItemIds={pendingItemIds}
                onToggleExpand={mutations.handleToggleExpand}
                onSetChecked={mutations.handleSetChecked}
                onMarkAsBought={mutations.handleMarkAsBought}
                onReassignStore={(itemId, targetStoreId) =>
                  void mutations.handleReassignStore(itemId, targetStoreId)
                }
                onRequestRemove={mutations.handleRequestRemove}
                stores={stores}
                productMap={productMap}
              />
            ))}
            {hasCovered && lifecycle.coveredIngredients !== null && (
              <CoveredIngredientsSection coveredIngredients={lifecycle.coveredIngredients} />
            )}
          </div>
        )}

        {lifecycle.status === 'active' &&
          (mutations.addFormOpen ? (
            <AddItemForm
              stores={stores}
              submitting={itemsAction.isPending(ADD_KEY)}
              onAdd={(input) => void mutations.handleAddItem(input)}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => mutations.setAddFormOpen(true)}
              className="h-11 w-full"
            >
              手動で追加
            </Button>
          ))}
      </div>

      <AlertDialog
        open={mutations.pendingRemoveItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            mutations.setPendingRemoveItem(null);
          }
        }}
      >
        {mutations.pendingRemoveItem !== null && (
          <AlertDialogContent>
            <AlertDialogTitle>
              {mutations.pendingRemoveItem.displayName}を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {describeRemoveConfirmation(mutations.pendingRemoveItem)}
            </AlertDialogDescription>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialogClose
                render={
                  <Button type="button" variant="outline" className="h-9">
                    キャンセル
                  </Button>
                }
              />
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const target = mutations.pendingRemoveItem;
                  // ダイアログ表示中は非 null。プロパティ経由だと TS が狭められないためガードする。
                  if (target === null) {
                    return;
                  }
                  mutations.setPendingRemoveItem(null);
                  mutations.handleRemoveItem(target.id);
                }}
                className="h-9"
              >
                削除する
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </main>
  );
}
