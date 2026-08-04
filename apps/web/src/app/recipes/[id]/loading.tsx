import { DetailSkeleton } from '@/app/_components/detail-skeleton';

/** レシピ詳細の Suspense 境界。材料・手順のリストを骨組みで置く。 */
export default function Loading() {
  return <DetailSkeleton rows={8} />;
}
