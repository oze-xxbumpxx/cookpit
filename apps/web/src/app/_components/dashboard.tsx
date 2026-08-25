import type { MealPlanDto, StockDto, StorageLocation } from '@cookpit/application';
import {
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@cookpit/application';
import { ExpiryAlertSubscription } from '@/app/_components/expiry-alert-subscription';
import { ThemeToggle } from '@/app/_components/theme-toggle';
import { expiryUrgencyChipClass, mealPlanStatusChipClass } from '@/app/_utils/category-color';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CircleHelp, Clock, Package, Refrigerator, Snowflake } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  LOCATION_LABELS,
  UNSET_LOCATION_LABEL,
  formatExpiresAt,
} from '../pantry/_utils/pantry-view';
import { formatWeekRange } from '../meal-plans/_utils/meal-plan-view';
import {
  getNextAction,
  getStepState,
  MEAL_PLAN_STATUS_LABELS,
  MEAL_PLAN_STATUS_STEPS,
} from '../_utils/dashboard-view';

interface Props {
  mealPlan: MealPlanDto | null;
  expiringStocks: StockDto[];
  asOf: Date;
}

const LOCATION_ICONS: Record<StorageLocation, LucideIcon> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Package,
};

function locationLabel(stock: StockDto): string {
  return stock.storedLocation === null
    ? UNSET_LOCATION_LABEL
    : LOCATION_LABELS[stock.storedLocation];
}

function locationIcon(stock: StockDto): LucideIcon {
  return stock.storedLocation === null ? CircleHelp : LOCATION_ICONS[stock.storedLocation];
}

export function Dashboard({ mealPlan, expiringStocks, asOf }: Props) {
  const nextAction = getNextAction(mealPlan);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">今週の状態</h1>
          <ThemeToggle />
        </div>

        <section>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            {mealPlan !== null && (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {formatWeekRange(mealPlan.weekIdentifier)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    mealPlanStatusChipClass(mealPlan.status),
                  )}
                >
                  {MEAL_PLAN_STATUS_LABELS[mealPlan.status]}
                </span>
                <span className="text-sm text-muted-foreground">
                  レシピ {mealPlan.plannedRecipes.length} 品
                </span>
              </span>
            )}
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">{nextAction.title}</h2>
              <p className="text-sm text-muted-foreground">{nextAction.description}</p>
            </div>
            <Link
              href={nextAction.href}
              className={cn(buttonVariants({ variant: 'default' }), 'h-11')}
            >
              {nextAction.ctaLabel}
            </Link>
            <ol aria-label="今週の進捗" className="flex items-center gap-1">
              {MEAL_PLAN_STATUS_STEPS.map((step, index) => {
                const state = getStepState(mealPlan?.status ?? null, step.status);
                return (
                  <li key={step.status} className="flex flex-1 items-center gap-1 last:flex-none">
                    <span
                      className={cn(
                        'whitespace-nowrap text-xs',
                        state === 'current' && 'font-medium text-primary',
                        state === 'complete' && 'text-foreground',
                        state === 'upcoming' && 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </span>
                    {index < MEAL_PLAN_STATUS_STEPS.length - 1 && (
                      <span aria-hidden="true" className="h-0 flex-1 border-t border-border" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
              <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">賞味期限が近い在庫</span>
              {expiringStocks.length > 0 && (
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {expiringStocks.length}
                </span>
              )}
            </h2>
            <Link
              href="/pantry"
              className="-my-1 shrink-0 py-1 text-xs text-muted-foreground underline"
            >
              在庫を見る
            </Link>
          </div>
          <ExpiryAlertSubscription />
          {expiringStocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              まもなく期限を迎える在庫はありません
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {expiringStocks.map((stock) => {
                const Icon = locationIcon(stock);
                const remainingDays = getExpiryRemainingDays(stock.expiresAt ?? '', asOf);
                const urgency = getExpiryUrgency(remainingDays);
                return (
                  <li
                    key={stock.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {stock.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">{locationLabel(stock)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          expiryUrgencyChipClass(urgency),
                        )}
                      >
                        {formatExpiryUrgencyLabel(remainingDays)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatExpiresAt(stock.expiresAt ?? '')}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
