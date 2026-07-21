import {
  findLatestPriceRecord,
  formatDate,
  formatYen,
  unitPriceBasisLabel,
} from '@/app/products/_utils/product-format';
import { productCategoryChipClass } from '@/app/_utils/category-color';
import { cn } from '@/lib/utils';
import type { ProductDto } from '@cookpit/application';
import { Package } from 'lucide-react';
import Link from 'next/link';

interface Props {
  product: ProductDto;
}

export function ProductCard({ product }: Props) {
  const latestPrice = findLatestPriceRecord(product.priceHistory);

  return (
    <Link
      href={`/products/${product.id}`}
      aria-label={`${product.name}の詳細を見る`}
      className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Package className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              productCategoryChipClass(product.category),
            )}
          >
            {product.category}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {product.defaultUnit}
          </span>
          {product.aliases.slice(0, 2).map((alias) => (
            <span
              key={alias}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                'bg-secondary text-muted-foreground',
              )}
            >
              {alias}
            </span>
          ))}
        </div>

        {latestPrice === null ? (
          <p className="text-xs text-muted-foreground">価格未登録</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            最新 {formatYen(latestPrice.priceAmount)} / {latestPrice.packageSizeValue}
            {latestPrice.packageSizeUnit}
            <span className="ml-1">
              {formatYen(latestPrice.unitPriceAmount)} /{' '}
              {unitPriceBasisLabel(latestPrice.packageSizeUnit)}
            </span>
            <span className="ml-1">({formatDate(latestPrice.observedAt)})</span>
          </p>
        )}
      </div>
    </Link>
  );
}
