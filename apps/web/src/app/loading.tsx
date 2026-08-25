import { Skeleton } from '@/app/_components/skeleton';

/**
 * ダッシュボードの Suspense 境界。`force-dynamic` + DB 往復のため応答までに数百 ms かかり、
 * 境界が無いと遷移が「無反応」に見える（設計書 §性能 順位 3）。
 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>

        <section className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
