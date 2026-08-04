import { Skeleton } from '@/app/_components/skeleton';

/** 献立履歴の Suspense 境界。週カードを 3 枚分の骨組みで置く。 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-6 w-28" />
          <div />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  );
}
