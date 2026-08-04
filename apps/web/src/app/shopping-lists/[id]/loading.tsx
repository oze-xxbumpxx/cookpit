import { Skeleton } from '@/app/_components/skeleton';

/**
 * 買い物リスト詳細の Suspense 境界。買い物中に開く画面で体感が効くため、
 * 店舗グループ 2 つ分の骨組みを置く（実運用は 2 店舗を回る）。
 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="mx-auto h-6 w-2/3" />
          <Skeleton className="size-11 rounded-xl" />
        </div>

        {Array.from({ length: 2 }).map((_, groupIndex) => (
          <section key={groupIndex} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, itemIndex) => (
                <Skeleton key={itemIndex} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
