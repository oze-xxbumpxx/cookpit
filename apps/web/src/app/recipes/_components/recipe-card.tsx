import { cn } from '@/lib/utils';
import { RecipeDto } from '@cookpit/application';
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
      className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
    >
      <div className="h-14 w-14 rounded-lg border border-zinc-200 bg-zinc-100" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-sm font-medium text-zinc-900">{recipe.name}</p>
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.cookingTime !== null && (
          <p className="text-xs text-zinc-500">調理時間 {recipe.cookingTime}分</p>
        )}
      </div>
    </Link>
  );
}
