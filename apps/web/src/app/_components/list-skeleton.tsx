import { Skeleton } from './skeleton';

interface Props {
  /** 検索バー相当のプレースホルダを出すか（一覧画面向け）。 */
  withSearch?: boolean;
}

/** 一覧画面のローディング骨組み（ヘッダー + カード数枚）。 */
export function ListSkeleton({ withSearch = true }: Props) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-9 w-16" />
        </div>
        {withSearch && <Skeleton className="h-11 w-full rounded-xl" />}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <Skeleton className="size-14 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
