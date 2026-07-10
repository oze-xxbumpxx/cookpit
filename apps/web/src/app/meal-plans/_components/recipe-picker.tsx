'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import { useMemo, useState } from 'react';

interface Props {
  recipes: RecipeDto[];
  onAdd: (recipeId: string, scaleFactor: number) => void;
  submitting: boolean;
}

const SCALE_PRESETS = [1, 1.5, 2, 3] as const;

export function RecipePicker({ recipes, onAdd, submitting }: Props) {
  const [query, setQuery] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [scaleFactor, setScaleFactor] = useState<number>(1);

  const filteredRecipes = useMemo(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery === '') {
      return recipes;
    }
    return recipes.filter((recipe) => recipe.name.includes(trimmedQuery));
  }, [recipes, query]);

  function handleAdd(): void {
    if (selectedRecipeId === null) {
      return;
    }
    onAdd(selectedRecipeId, scaleFactor);
    setSelectedRecipeId(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div>
        <label htmlFor="recipe-picker-search" className="sr-only">
          レシピを検索
        </label>
        <Input
          id="recipe-picker-search"
          type="search"
          placeholder="レシピを検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 rounded-lg bg-background"
        />
      </div>

      {filteredRecipes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">該当するレシピがありません</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {filteredRecipes.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                onClick={() => setSelectedRecipeId(recipe.id)}
                aria-pressed={selectedRecipeId === recipe.id}
                className={cn(
                  'w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  selectedRecipeId === recipe.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {recipe.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {SCALE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setScaleFactor(preset)}
            aria-pressed={scaleFactor === preset}
            className={cn(
              'flex-1 rounded-lg border py-1.5 text-sm transition-colors',
              scaleFactor === preset
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-secondary text-secondary-foreground hover:bg-muted',
            )}
          >
            {preset}×
          </button>
        ))}
      </div>

      <Button
        type="button"
        onClick={handleAdd}
        disabled={selectedRecipeId === null || submitting}
        className="h-10 w-full"
      >
        献立に追加
      </Button>
    </div>
  );
}
