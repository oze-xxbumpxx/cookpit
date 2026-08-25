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
import type { ProductDto, ShoppingListDto, StoreDto } from '@cookpit/application';
import { EmptyState } from '@/app/_components/empty-state';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  describeRemoveConfirmation,
  formatShoppingDate,
  groupItemsByStore,
} from '../_utils/shopping-list-view';
import { useShoppingListComplete } from '../_utils/use-shopping-list-complete';
import {
  OFFLINE_QUEUE_BANNER_MESSAGE,
  useShoppingListItems,
} from '../_utils/use-shopping-list-items';
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

/** 詳細画面の layout / composition（Client。S-4/D-7）。状態と操作は hooks へ委譲。 */
export function ShoppingListClient({ shoppingList, stores, products }: Props) {
  const {
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
    addKey,
    refreshKey,
    handleSync,
    handleRefetch,
    handleMarkAsBought,
    handleSetChecked,
    handleRequestRemove,
    handleRemoveItem,
    handleAddItem,
    handleReassignStore,
    handleToggleExpand,
  } = useShoppingListItems({ shoppingList });

  const {
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
  } = useShoppingListComplete({ shoppingList, boughtItems });

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groupedItems = groupItemsByStore(optimisticItems, stores);
  // 完了済みリストへの品目操作はサーバーが 422 で拒否する（ADR-0009 決定 3）。
  // UI 側でも操作できないようにし、ルールと表示を一致させる。
  const readOnly = status !== 'active';
  const hasCovered = coveredIngredients !== null && coveredIngredients.length > 0;
  const showEmptyState = optimisticItems.length === 0 && !hasCovered;

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
              onClick={() => void handleRefetch({ silent: false })}
              disabled={itemsAction.isPending(refreshKey)}
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
            {!completePanelOpen && (
              <Button
                type="button"
                onClick={handleCompleteRequest}
                disabled={completeAction.pending}
                className="h-11 w-full"
              >
                買い物完了
              </Button>
            )}
            {completePanelOpen && (
              <CompleteShoppingPanel
                items={boughtItems}
                submitting={completeAction.pending}
                onCancel={() => setCompletePanelOpen(false)}
                onComplete={(stockAdditions) => void handleComplete(stockAdditions)}
              />
            )}
          </>
        )}

        {completeAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {completeAction.errorMessage}
          </p>
        )}

        {status === 'completed' && (
          <>
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {COMPLETED_GUIDANCE}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleReopen()}
              disabled={reopenAction.pending}
              className="h-11 w-full"
            >
              買い物を再開
            </Button>
          </>
        )}

        {reopenAction.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {reopenAction.errorMessage}
          </p>
        )}

        {completeSuccess && (
          <div className="rounded-lg border bg-secondary px-3 py-2 text-sm text-foreground">
            <p>買い物を完了しました</p>
            {addedStockCount > 0 && <p>{addedStockCount}件を在庫に追加しました</p>}
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
                expandedItemId={expandedItemId}
                submittingItemId={submittingItemId}
                readOnly={readOnly}
                pendingItemIds={pendingItemIds}
                onToggleExpand={handleToggleExpand}
                onSetChecked={handleSetChecked}
                onMarkAsBought={handleMarkAsBought}
                onReassignStore={(itemId, targetStoreId) =>
                  void handleReassignStore(itemId, targetStoreId)
                }
                onRequestRemove={handleRequestRemove}
                stores={stores}
                productMap={productMap}
              />
            ))}
            {hasCovered && coveredIngredients !== null && (
              <CoveredIngredientsSection coveredIngredients={coveredIngredients} />
            )}
          </div>
        )}

        {status === 'active' &&
          (addFormOpen ? (
            <AddItemForm
              stores={stores}
              submitting={itemsAction.isPending(addKey)}
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

      <AlertDialog
        open={pendingRemoveItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoveItem(null);
          }
        }}
      >
        {pendingRemoveItem !== null && (
          <AlertDialogContent>
            <AlertDialogTitle>{pendingRemoveItem.displayName}を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {describeRemoveConfirmation(pendingRemoveItem)}
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
                  const target = pendingRemoveItem;
                  setPendingRemoveItem(null);
                  handleRemoveItem(target.id);
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
