import { DetailSkeleton } from '@/app/_components/detail-skeleton';

/** 商品詳細の Suspense 境界。最安店舗・最新価格の指標 2 枚と価格推移グラフを骨組みで置く。 */
export default function Loading() {
  return <DetailSkeleton withStats withChart rows={3} />;
}
