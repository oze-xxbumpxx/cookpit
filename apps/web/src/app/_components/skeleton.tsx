import { cn } from '@/lib/utils';

/** ローディング中のプレースホルダ（pulse アニメーション）。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden="true" />;
}
