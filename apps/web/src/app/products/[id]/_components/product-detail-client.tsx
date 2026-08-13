'use client';

import {
  PriceHistoryChartSkeleton,
  PriceHistoryEmpty,
} from '@/app/products/[id]/_components/price-history-chart-skeleton';
import { PriceRecordEditDialog } from '@/app/products/[id]/_components/price-record-edit-dialog';
import { PriceRecordForm } from '@/app/products/[id]/_components/price-record-form';
import {
  findLatestPriceRecord,
  formatDateTime,
  formatUnitPrice,
  formatYen,
  sortPriceHistoryByObservedAt,
} from '@/app/products/_utils/product-format';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { productCategoryChipClass } from '@/app/_utils/category-color';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { CheapestStoreResultDto, PriceRecordDto, ProductDto } from '@cookpit/application';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const PriceHistoryChart = dynamic(
  () =>
    import('@/app/products/[id]/_components/price-history-chart').then(
      (mod) => mod.PriceHistoryChart,
    ),
  {
    ssr: false,
    loading: () => <PriceHistoryChartSkeleton />,
  },
);

interface Props {
  product: ProductDto;
  cheapestStore: CheapestStoreResultDto | null;
}

export function ProductDetailClient({ product, cheapestStore }: Props) {
  const router = useRouter();
  const latestPrice = findLatestPriceRecord(product.priceHistory);
  const recentPriceHistory = sortPriceHistoryByObservedAt(product.priceHistory).slice(-5).reverse();
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<PriceRecordDto | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [recordDeleteErrorMessage, setRecordDeleteErrorMessage] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PriceRecordDto | null>(null);

  async function handleDeletePriceRecord(): Promise<void> {
    if (pendingDeleteRecord === null) {
      return;
    }

    setDeletingRecord(true);
    setRecordDeleteErrorMessage(null);
    try {
      const response = await client.api.products[':id']['price-records'][':priceRecordId'].$delete({
        param: { id: product.id, priceRecordId: pendingDeleteRecord.id },
      });
      // 404 は「既に消えている」＝目的達成なので成功として扱う（削除操作を冪等にする）。
      // Hono RPC の型は 404 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (!response.ok && status !== 404) {
        setRecordDeleteErrorMessage('記録の削除に失敗しました。');
        return;
      }

      setPendingDeleteRecord(null);
      router.refresh();
    } catch {
      setRecordDeleteErrorMessage('通信エラーが発生しました。');
    } finally {
      setDeletingRecord(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setDeleteErrorMessage(null);
    try {
      const response = await client.api.products[':id'].$delete({ param: { id: product.id } });
      if (!response.ok) {
        setDeleteErrorMessage('削除に失敗しました。');
        return;
      }
      router.push('/products');
      router.refresh();
    } catch {
      setDeleteErrorMessage('通信エラーが発生しました。');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={() => router.push('/products')}
            aria-label="一覧に戻る"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate text-center text-xl font-semibold text-foreground">
            {product.name}
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => router.push(`/products/${product.id}/edit`)}
            aria-label="編集"
            className="text-foreground"
          >
            <Pencil className="size-5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              productCategoryChipClass(product.category),
            )}
          >
            {product.category}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
            基本単位 {product.defaultUnit}
          </span>
          {product.aliases.map((alias) => (
            <span
              key={alias}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                'bg-secondary text-muted-foreground',
              )}
            >
              {alias}
            </span>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">最安店舗</p>
            {cheapestStore === null ? (
              <p className="text-lg font-semibold text-foreground">未登録</p>
            ) : (
              <>
                <p className="truncate text-lg font-semibold text-foreground">
                  {cheapestStore.storeName === '' ? '店舗未設定' : cheapestStore.storeName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatUnitPrice(cheapestStore.unitPrice, cheapestStore.packageSizeUnit)}
                </p>
              </>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">最新価格</p>
            {latestPrice === null ? (
              <p className="text-lg font-semibold text-foreground">未登録</p>
            ) : (
              <>
                <p className="text-lg font-semibold text-foreground">
                  {formatYen(latestPrice.priceAmount)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {latestPrice.packageSizeValue}
                  {latestPrice.packageSizeUnit} /{' '}
                  {latestPrice.storeName === '' ? '店舗未設定' : latestPrice.storeName}
                </p>
              </>
            )}
          </div>
        </section>

        <PriceRecordForm product={product} />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-foreground">価格推移</h2>
          {/* 0 件では遅延読み込みを行わない。スケルトン（256px）と空状態（約 86px）の
              高さが違うためシフトが起きるうえ、recharts の 373 KB を取る意味も無い（M-1）。 */}
          {product.priceHistory.length === 0 ? (
            <PriceHistoryEmpty />
          ) : (
            <PriceHistoryChart priceHistory={product.priceHistory} />
          )}
        </section>

        {recentPriceHistory.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">最近の記録</h2>
            {recordDeleteErrorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {recordDeleteErrorMessage}
              </p>
            )}
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {recentPriceHistory.map((record) => (
                <div
                  key={record.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {record.storeName === '' ? '店舗未設定' : record.storeName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(record.observedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      {formatYen(record.priceAmount)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {record.packageSizeValue}
                        {record.packageSizeUnit}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatUnitPrice(record.unitPriceAmount, record.packageSizeUnit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingRecord(record)}
                      aria-label={`${formatDateTime(record.observedAt)}の記録を編集`}
                      className="text-muted-foreground"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingDeleteRecord(record)}
                      disabled={deletingRecord}
                      aria-label={`${formatDateTime(record.observedAt)}の記録を削除`}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="pt-2 pb-8">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive" className="h-11 w-full">
                  この商品を削除
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogTitle>この商品を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                削除すると元に戻せません。価格履歴も削除されます。
              </AlertDialogDescription>
              {deleteErrorMessage !== null && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {deleteErrorMessage}
                </p>
              )}
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
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-9"
                >
                  {deleting ? '削除中' : '削除する'}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <AlertDialog
        open={pendingDeleteRecord !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteRecord(null);
          }
        }}
      >
        {pendingDeleteRecord !== null && (
          <AlertDialogContent>
            <AlertDialogTitle>この価格記録を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteRecord.storeName === '' ? '店舗未設定' : pendingDeleteRecord.storeName}{' '}
              / {formatYen(pendingDeleteRecord.priceAmount)} /{' '}
              {pendingDeleteRecord.packageSizeValue}
              {pendingDeleteRecord.packageSizeUnit} /{' '}
              {formatDateTime(pendingDeleteRecord.observedAt)}
              <br />
              削除すると元に戻せません。正しい内容で記録し直してください。
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
                onClick={handleDeletePriceRecord}
                disabled={deletingRecord}
                className="h-9"
              >
                {deletingRecord ? '削除中' : '削除する'}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <PriceRecordEditDialog
        product={product}
        record={editingRecord}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRecord(null);
          }
        }}
      />
    </main>
  );
}
