'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDuplicateStoreName } from '@/app/products/_utils/store-name';
import { client } from '@/lib/api-client';
import type { RenameStoreBody } from '@cookpit/api-contract';
import type { StoreDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

const DUPLICATE_STORE_MESSAGE = '同じ名前の店舗がすでに登録されています。';

interface Props {
  store: StoreDto | null;
  existingStoreNames: string[];
  onOpenChange: (open: boolean) => void;
  onRenamed: (updated: StoreDto) => void;
}

/**
 * 店舗名編集ダイアログ。注意喚起はインライン警告のみ（二段階確認は設けない。2026-08-05
 * ユーザー確定）。usage 取得の失敗は補助情報の取得失敗として操作をブロックしない。
 */
export function StoreRenameDialog({ store, existingStoreNames, onOpenChange, onRenamed }: Props) {
  const router = useRouter();
  const nameId = useId();

  const [name, setName] = useState('');
  const [priceRecordCount, setPriceRecordCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = store !== null;
  const nameError =
    name.trim() === ''
      ? '店舗名を入力してください。'
      : isDuplicateStoreName(name, existingStoreNames)
        ? DUPLICATE_STORE_MESSAGE
        : null;
  const canSubmit = nameError === null && !submitting;

  useEffect(() => {
    if (store === null) {
      return;
    }
    // TS の narrowing はネストした関数のスコープへ引き継がれないため、const で捕捉する。
    const targetStore = store;

    let cancelled = false;
    // setState は非同期関数側にまとめる（同期的な effect 本体での setState は
    // react-hooks/set-state-in-effect に抵触するため、既存 PriceRecordForm と同じ形にする）。
    async function initialize(): Promise<void> {
      setName(targetStore.name);
      setErrorMessage(null);
      setPriceRecordCount(null);
      try {
        const response = await client.api.stores[':id'].usage.$get({
          param: { id: targetStore.id },
        });
        if (response.ok && !cancelled) {
          const usage = await response.json();
          setPriceRecordCount(usage.priceRecordCount);
        }
      } catch {
        // 件数はリネームの可否に影響しない補助情報なので、失敗を握って操作を続行させる。
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (store === null || !canSubmit) {
      return;
    }

    const body: RenameStoreBody = { name: name.trim() };
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api.stores[':id'].$put({ param: { id: store.id }, json: body });
      if (response.ok) {
        const updated = await response.json();
        onRenamed(updated);
        onOpenChange(false);
        router.refresh();
        return;
      }

      // Hono RPC の型は 404/422 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (status === 404) {
        setErrorMessage('この店舗はすでに削除されています。');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (status === 422) {
        setErrorMessage(DUPLICATE_STORE_MESSAGE);
        return;
      }
      setErrorMessage('店舗名を入力してください。');
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {store !== null && (
        <AlertDialogContent>
          <AlertDialogTitle>店舗名を編集</AlertDialogTitle>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            {errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            {priceRecordCount !== null && priceRecordCount > 0 && (
              <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {`この店舗の価格記録 ${priceRecordCount} 件の表示名も変わります。違う店舗を選んでいないか確認してください。`}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={nameId} className="text-sm font-medium text-foreground">
                店舗名
              </label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={nameError !== null}
                className="h-11 rounded-xl bg-card"
              />
              {nameError !== null && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose
                render={
                  <Button type="button" variant="outline" className="h-9">
                    キャンセル
                  </Button>
                }
              />
              <Button type="submit" disabled={!canSubmit} className="h-9">
                {submitting ? '保存中' : '保存'}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
