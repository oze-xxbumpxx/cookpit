import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import Link from 'next/link';

interface Props {
  recipe: RecipeDto;
}

export function RecipeCard({ recipe }: Props) {
  const visibleTags = recipe.tags.slice(0, 3);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      aria-label={`${recipe.name}の詳細を見る`}
      className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="h-14 w-14 rounded-lg border border-border bg-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-sm font-medium text-foreground">{recipe.name}</p>
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  index === 0
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.cookingTime !== null && (
          <p className="text-xs text-muted-foreground">調理時間 {recipe.cookingTime}分</p>
        )}
      </div>
    </Link>
  );
}
