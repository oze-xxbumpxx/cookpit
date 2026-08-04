import { Skeleton } from './skeleton';

interface Props {
  /** ヘッダー下に指標カード 2 枚を出すか（商品詳細向け）。 */
  withStats?: boolean;
  /** グラフ・大きめブロックのプレースホルダを出すか。 */
  withChart?: boolean;
  /** 本文の行数。 */
  rows?: number;
}

/**
 * 詳細画面のローディング骨組み（戻る + 中央タイトル + アクション のヘッダー）。
 * 一覧の `ListSkeleton` と対になる。
 */
export function DetailSkeleton({ withStats = false, withChart = false, rows = 5 }: Props) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="mx-auto h-6 w-1/2" />
          <Skeleton className="size-11 rounded-xl" />
        </div>

        {withStats && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {withChart && <Skeleton className="h-64 w-full rounded-xl" />}

        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  );
}
