'use client';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RecipeDto } from '@cookpit/application';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TagFilter, TagFilterValue } from './tag-filter';
import { RecipeCard } from './recipe-card';
import { Input } from '@/components/ui/input';

interface Props {
  initialRecipes: RecipeDto[];
}

export function RecipeListClient({ initialRecipes }: Props) {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<TagFilterValue>('all');

  const filteredRecipes = useMemo(() => {
    const trimmedQuery = query.trim();
    return initialRecipes.filter((recipe) => {
      const matchesTag = selectedTag === 'all' || recipe.tags.includes(selectedTag);
      const matchesQuery = trimmedQuery === '' || recipe.name.includes(trimmedQuery);

      return matchesTag && matchesQuery;
    });
  }, [initialRecipes, query, selectedTag]);

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div aria-hidden="true" />
          <h1 className="text-lg font-semibold text-zinc-900">レシピ</h1>
          <div className="flex justify-end">
            <Link href="/recipes/new" className={cn(buttonVariants({ size: 'sm' }), 'h-9 px-3')}>
              <Plus className="size-3.5" aria-hidden="true" />
              追加
            </Link>
          </div>
        </header>
        <div>
          <label htmlFor="recipe-search" className="sr-only">
            レシピを検索
          </label>
          <Input
            id="recipe-search"
            type="search"
            placeholder="レシピを検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-xl bg-white"
          />
        </div>
        <TagFilter value={selectedTag} onChange={setSelectedTag} />
        <section aria-label="レシピ一覧">
          {initialRecipes.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              まだレシピがありません。右上から追加できます。
            </p>
          ) : filteredRecipes.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">該当するレシピがありません</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredRecipes.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard recipe={recipe} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
