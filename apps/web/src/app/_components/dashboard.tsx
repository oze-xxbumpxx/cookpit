import type { MealPlanDto, StockDto, StorageLocation } from '@cookpit/application';
import { ThemeToggle } from '@/app/_components/theme-toggle';
import { expiryUrgencyChipClass, mealPlanStatusChipClass } from '@/app/_utils/category-color';
import {
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@/app/_utils/expiry';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  ChefHat,
  CircleHelp,
  Clock,
  Package,
  Refrigerator,
  ShoppingCart,
  Snowflake,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  LOCATION_LABELS,
  UNSET_LOCATION_LABEL,
  formatExpiresAt,
} from '../pantry/_utils/pantry-view';
import { formatWeekRange } from '../meal-plans/_utils/meal-plan-view';
import { MEAL_PLAN_STATUS_LABELS } from '../_utils/dashboard-view';

interface Props {
  mealPlan: MealPlanDto | null;
  expiringStocks: StockDto[];
  asOf: Date;
}

const QUICK_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/meal-plans', label: '献立', Icon: CalendarDays },
  { href: '/shopping-lists', label: '買い物リスト', Icon: ShoppingCart },
  { href: '/pantry', label: '在庫', Icon: Refrigerator },
  { href: '/recipes', label: 'レシピ', Icon: ChefHat },
  { href: '/products', label: '商品', Icon: Tag },
];

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
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">今週の状態</h1>
          <ThemeToggle />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">今週の献立</h2>
          {mealPlan === null ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">今週の献立はまだありません</p>
              <Link
                href="/meal-plans"
                className={cn(buttonVariants({ variant: 'default' }), 'h-11')}
              >
                今週の献立を作る
              </Link>
            </div>
          ) : (
            <Link
              href="/meal-plans"
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <span className="text-sm font-medium text-foreground">
                {formatWeekRange(mealPlan.weekIdentifier)}
              </span>
              <span className="flex items-center gap-2">
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
            </Link>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
              賞味期限が近い在庫
              {expiringStocks.length > 0 && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {expiringStocks.length}
                </span>
              )}
            </h2>
            <Link href="/pantry" className="-my-1 py-1 text-xs text-muted-foreground underline">
              在庫を見る
            </Link>
          </div>
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
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {stock.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">{locationLabel(stock)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
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

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">メニュー</h2>
          <nav className="grid grid-cols-2 gap-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </main>
  );
}
