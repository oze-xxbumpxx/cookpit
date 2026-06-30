'use client';

import { PriceHistoryChart } from '@/app/products/[id]/_components/price-history-chart';
import { PriceRecordForm } from '@/app/products/[id]/_components/price-record-form';
import {
  findLatestPriceRecord,
  formatDateTime,
  formatYen,
  sortPriceHistoryByObservedAt,
  unitPriceBasisLabel,
} from '@/app/products/_utils/product-format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CheapestStoreResultDto, ProductDto } from '@cookpit/application';
import { ChevronLeft, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  product: ProductDto;
  cheapestStore: CheapestStoreResultDto | null;
}

export function ProductDetailClient({ product, cheapestStore }: Props) {
  const router = useRouter();
  const latestPrice = findLatestPriceRecord(product.priceHistory);
  const recentPriceHistory = sortPriceHistoryByObservedAt(product.priceHistory).slice(-5).reverse();

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => router.push('/products')}
            aria-label="一覧に戻る"
            className="text-foreground"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h1 className="truncate text-center text-lg font-semibold text-foreground">
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
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
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
                  {formatYen(cheapestStore.unitPrice)} / 比較単位
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
                <p className="text-xs text-muted-foreground">
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
          <PriceHistoryChart priceHistory={product.priceHistory} />
        </section>

        {recentPriceHistory.length > 0 && (
          <section className="flex flex-col gap-2 pb-8">
            <h2 className="text-sm font-medium text-foreground">最近の記録</h2>
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {recentPriceHistory.map((record) => (
                <div
                  key={`${record.storeId}-${record.observedAt}`}
                  className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm"
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
                    <p className="font-medium text-foreground">{formatYen(record.priceAmount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatYen(record.unitPriceAmount)} /{' '}
                      {unitPriceBasisLabel(record.packageSizeUnit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
