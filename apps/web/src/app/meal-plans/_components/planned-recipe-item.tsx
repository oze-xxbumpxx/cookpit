import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlannedRecipeDto } from '@cookpit/application';
import { X } from 'lucide-react';
import Link from 'next/link';

interface Props {
  plannedRecipe: PlannedRecipeDto;
  recipeName: string | null;
  onRemove: (plannedRecipeId: string) => void;
  submitting: boolean;
}

export function PlannedRecipeItem({ plannedRecipe, recipeName, onRemove, submitting }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {recipeName !== null ? (
          <Link
            href={`/recipes/${plannedRecipe.recipeId}`}
            className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
          >
            {recipeName}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm text-muted-foreground">削除済みレシピ</span>
        )}
        <span
          className={cn(
            'shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
          )}
        >
          {plannedRecipe.scaleFactor}×
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(plannedRecipe.id)}
        disabled={submitting}
        aria-label="献立から削除"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
