'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  recipe: RecipeDto;
}

const SCALE_OPTIONS = [1, 1.5, 2, 3] as const;

type ScaleFactor = (typeof SCALE_OPTIONS)[number];

function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatIngredientAmount(
  amountValue: number | null,
  amountNote: string | null,
  scale: ScaleFactor,
): string {
  if (amountValue === null) {
    return amountNote ?? '';
  }

  return formatAmount(amountValue * scale);
}

export function RecipeDetailClient({ recipe }: Props) {
  const router = useRouter();
  const [scale, setScale] = useState<ScaleFactor>(1);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const servings = formatAmount(recipe.baseServings * scale);

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setErrorMessage(null);
    try {
      const res = await client.api.recipes[':id'].$delete({ param: { id: recipe.id } });
      if (!res.ok) {
        setErrorMessage('削除に失敗しました。');
        return;
      }
      router.push('/recipes');
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => router.push('/recipes')}
            aria-label="一覧に戻る"
            className="text-zinc-700"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h1 className="truncate text-center text-lg font-semibold text-zinc-900">
            {recipe.name}
          </h1>
          <span aria-hidden="true" className="w-9" />
        </header>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-700',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">調理時間</p>
            <p className="text-lg font-semibold text-zinc-900">
              {recipe.cookingTime === null ? '—' : `${recipe.cookingTime}分`}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">基準人数</p>
            <p className="text-lg font-semibold text-zinc-900">{recipe.baseServings}人分</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">
            倍量 <span className="text-xs font-normal text-zinc-500">材料の数値に反映</span>
          </p>
          <div className="flex gap-2">
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setScale(option)}
                aria-pressed={scale === option}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm transition-colors',
                  scale === option
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
                )}
              >
                {option}×
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">
            材料 <span className="text-xs font-normal text-zinc-500">{servings}人分</span>
          </p>
          <div className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {recipe.ingredients.map((ingredient, index) => (
              <div
                key={`${ingredient.displayName}-${index}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 text-zinc-900">{ingredient.displayName}</span>
                <span className="text-right font-medium text-zinc-900">
                  {formatIngredientAmount(ingredient.amountValue, ingredient.amountNote, scale)}
                </span>
                <span className="w-10 text-right text-zinc-500">{ingredient.amountUnit ?? ''}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">作り方</p>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, index) => (
              <li key={index} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-700">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm whitespace-pre-wrap text-zinc-800">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {recipe.notes.trim() !== '' && (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-900">メモ</p>
            <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm whitespace-pre-wrap text-zinc-800">
              {recipe.notes}
            </p>
          </section>
        )}

        <div className="pt-2 pb-8">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive" className="h-11 w-full">
                  このレシピを削除
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogTitle>このレシピを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>削除すると元に戻せません。</AlertDialogDescription>
              {errorMessage !== null && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
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
    </main>
  );
}
