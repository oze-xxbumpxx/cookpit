'use client';

import { EmptyState } from '@/app/_components/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useApiAction } from '@/lib/use-api-action';
import type { MealPlanDto } from '@cookpit/application';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  mealPlan: MealPlanDto | null;
}

/** エントリ画面のボタン・空状態（Client。S-1/S-2）。 */
export function ShoppingListEntryClient({ mealPlan }: Props) {
  const router = useRouter();
  const action = useApiAction();

  async function handleGenerate(): Promise<void> {
    if (mealPlan === null) {
      return;
    }
    await action.run(
      () => client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } }),
      {
        onSuccess: (result) => router.push(`/shopping-lists/${result.id}`),
      },
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">買い物リスト</h1>
        </header>

        {action.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {action.errorMessage}
          </p>
        )}

        {mealPlan === null ? (
          <EmptyState Icon={ShoppingCart} message="買い物リストは献立から作られます">
            <Link
              href="/meal-plans"
              className={cn(buttonVariants({ variant: 'default' }), 'h-11 px-6')}
            >
              今週の献立を作る
            </Link>
          </EmptyState>
        ) : (
          <EmptyState
            Icon={ShoppingCart}
            message={
              mealPlan.status === 'draft'
                ? '献立をもとに買い物リストを作成できます'
                : '作成済みの買い物リストがあります'
            }
          >
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={action.pending}
              className="h-11 px-6"
            >
              {mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'}
            </Button>
          </EmptyState>
        )}
      </div>
    </main>
  );
}
