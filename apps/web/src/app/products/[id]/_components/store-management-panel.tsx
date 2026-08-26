'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StoreRenameDialog } from '@/app/products/[id]/_components/store-rename-dialog';
import { STORE_LIMIT } from '@/app/products/_utils/store-name';
import {
  DUPLICATE_STORE_MESSAGE,
  STORE_LIMIT_MESSAGE,
  type StoreManagementResult,
} from '@/app/products/[id]/_components/use-store-management';
import { Pencil, Trash2 } from 'lucide-react';
import { useId } from 'react';

interface Props {
  management: StoreManagementResult;
}

export function StoreManagementPanel({ management }: Props) {
  const {
    stores,
    storesLoading,
    newStoreName,
    setNewStoreName,
    storeLimitReached,
    duplicateStoreName,
    canCreateStore,
    creatingStore,
    handleCreateStore,
    deletingStore,
    requestDeleteStore,
    pendingDeleteStore,
    pendingDeleteUsage,
    handleDeleteDialogOpenChange,
    handleDeleteStore,
    renamingStore,
    setRenamingStore,
    handleRenamedStore,
  } = management;
  const newStoreNameId = useId();
  const newStoreHintId = useId();

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-3">
        <p className="text-xs text-muted-foreground">
          {storesLoading
            ? '店舗を読み込んでいます。'
            : stores.length === 0
              ? '店舗がまだ登録されていません。価格を記録する前に店舗を追加してください。'
              : `プルダウンに出す店舗をここで追加・削除できます（${STORE_LIMIT}件まで）。`}
        </p>
        {stores.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {stores.map((store) => (
              <li
                key={store.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5"
              >
                <span className="truncate text-sm text-foreground">{store.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRenamingStore(store)}
                    aria-label={`${store.name}を編集`}
                    className="text-muted-foreground"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void requestDeleteStore(store)}
                    disabled={deletingStore}
                    aria-label={`${store.name}を削除`}
                    className="text-muted-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={newStoreNameId} className="sr-only">
          追加する店舗名
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            id={newStoreNameId}
            value={newStoreName}
            onChange={(event) => setNewStoreName(event.currentTarget.value)}
            placeholder="例：近所のスーパー"
            disabled={storeLimitReached}
            aria-invalid={duplicateStoreName}
            aria-describedby={storeLimitReached || duplicateStoreName ? newStoreHintId : undefined}
            className="h-10 rounded-lg bg-card"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleCreateStore}
            disabled={!canCreateStore}
            className="h-10 px-3"
          >
            {creatingStore ? '追加中' : '追加'}
          </Button>
        </div>
        {/* 上限は同名より重い制約（既存を消さないと解消しない）ので、両方該当する場合は上限を出す。 */}
        {(storeLimitReached || duplicateStoreName) && (
          <p id={newStoreHintId} className="text-xs text-destructive">
            {storeLimitReached ? STORE_LIMIT_MESSAGE : DUPLICATE_STORE_MESSAGE}
          </p>
        )}
      </div>

      <AlertDialog open={pendingDeleteStore !== null} onOpenChange={handleDeleteDialogOpenChange}>
        {pendingDeleteStore !== null && (
          <AlertDialogContent>
            <AlertDialogTitle>{pendingDeleteStore.name}を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteUsage === null ? (
                // 件数の取得前・取得失敗時。失われるものは定性的に伝え、削除は止めない（ADR-0013）。
                <>この店舗の価格記録はすべて削除されます。元には戻せません。</>
              ) : (
                <>
                  この店舗の
                  <strong className="font-semibold">
                    価格記録 {pendingDeleteUsage.priceRecordCount} 件
                  </strong>
                  が削除されます。
                  {pendingDeleteUsage.shoppingItemCount > 0 && (
                    // JSX の改行はスペースに畳まれて「指定が 未割当」のように割れるため、
                    // 折り返しても崩れないテンプレートリテラルで組み立てる。
                    <>
                      {`買い物の品目 ${pendingDeleteUsage.shoppingItemCount} 件は、` +
                        '店舗の指定が未割当に戻ります（品目自体は残ります）。'}
                    </>
                  )}
                  <br />
                  元には戻せません。
                </>
              )}
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
                onClick={handleDeleteStore}
                disabled={deletingStore}
                className="h-9"
              >
                {deletingStore ? '削除中' : '削除する'}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <StoreRenameDialog
        store={renamingStore}
        existingStoreNames={
          renamingStore === null
            ? []
            : stores.filter((s) => s.id !== renamingStore.id).map((s) => s.name)
        }
        onOpenChange={(open) => {
          if (!open) {
            setRenamingStore(null);
          }
        }}
        onRenamed={handleRenamedStore}
      />
    </>
  );
}
