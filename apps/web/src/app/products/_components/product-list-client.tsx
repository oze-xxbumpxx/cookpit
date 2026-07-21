'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ProductDto } from '@cookpit/application';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PRODUCT_CATEGORY_OPTIONS } from './product-form-fields';
import { ProductCard } from './product-card';

interface Props {
  initialProducts: ProductDto[];
}

type CategoryFilterValue = 'all' | string;

export function ProductListClient({ initialProducts }: Props) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterValue>('all');

  const categoryOptions = useMemo(() => {
    const values: string[] = [...PRODUCT_CATEGORY_OPTIONS];
    for (const product of initialProducts) {
      if (!values.includes(product.category)) {
        values.push(product.category);
      }
    }
    return values;
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    const trimmedQuery = query.trim().toLocaleLowerCase('ja-JP');
    return initialProducts.filter((product) => {
      const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
      const searchableText = [product.name, ...product.aliases]
        .join(' ')
        .toLocaleLowerCase('ja-JP');
      const matchesQuery = trimmedQuery === '' || searchableText.includes(trimmedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [initialProducts, query, selectedCategory]);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-foreground">商品</h1>
          <Link href="/products/new" className={cn(buttonVariants({ size: 'sm' }), 'h-9 px-3')}>
            <Plus className="size-3.5" aria-hidden="true" />
            追加
          </Link>
        </header>

        <div>
          <label htmlFor="product-search" className="sr-only">
            商品を検索
          </label>
          <Input
            id="product-search"
            type="search"
            placeholder="商品を検索"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="h-11 rounded-xl bg-card"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="商品カテゴリ">
          <Button
            type="button"
            variant={selectedCategory === 'all' ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
            className="h-8 shrink-0 rounded-full px-3"
          >
            すべて
          </Button>
          {categoryOptions.map((category) => (
            <Button
              key={category}
              type="button"
              variant={selectedCategory === category ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              aria-pressed={selectedCategory === category}
              className="h-8 shrink-0 rounded-full px-3"
            >
              {category}
            </Button>
          ))}
        </div>

        <section aria-label="商品一覧">
          {initialProducts.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              まだ商品がありません。右上から追加できます。
            </p>
          ) : filteredProducts.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              該当する商品がありません
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredProducts.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
