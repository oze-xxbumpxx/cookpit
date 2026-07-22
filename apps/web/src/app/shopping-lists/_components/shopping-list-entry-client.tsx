'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { MealPlanDto, ShoppingListDto } from '@cookpit/application';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  mealPlan: MealPlanDto | null;
}

/** エントリ画面のボタン・空状態（Client。S-1/S-2）。 */
export function ShoppingListEntryClient({ mealPlan }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate(): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api['shopping-lists'].$post({
        json: { mealPlanId: mealPlan.id },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const result: ShoppingListDto = await response.json();
      router.push(`/shopping-lists/${result.id}`);
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">買い物リスト</h1>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {mealPlan === null ? (
          <section className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">今週の献立はまだありません</p>
            <Link
              href="/meal-plans"
              className={cn(buttonVariants({ variant: 'default' }), 'h-11 px-6')}
            >
              今週の献立を作る
            </Link>
          </section>
        ) : (
          <section className="flex flex-col items-center gap-4 py-12 text-center">
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={submitting}
              className="h-11 px-6"
            >
              {mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'}
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
