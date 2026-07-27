import { Skeleton } from '@/app/_components/skeleton';

/** 買い物リスト入口の Suspense 境界。今週の献立を引くまで待つため境界が必要。 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </main>
  );
}
