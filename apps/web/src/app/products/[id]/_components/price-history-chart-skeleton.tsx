/**
 * 価格推移チャートの高さ。**スケルトンとチャート本体で必ず同じ値を使う**
 * （`price-history-chart.tsx` の `ChartContainer` がこれを import する）。
 * 片方だけ変えると遅延解決時にレイアウトシフトが復活する（レビュー M-1 / S-2）。
 *
 * 定義をこのファイルに置くのは、チャート側に置くと `next/dynamic` の `loading` から
 * 参照した時点で recharts が初期バンドルへ戻るため。**この向きの依存は変えないこと。**
 */
export const PRICE_HISTORY_CHART_HEIGHT_CLASS = 'h-64';

/**
 * `PriceHistoryChart` の遅延読み込み中に表示するプレースホルダ。
 *
 * **このファイルは recharts / `components/ui/chart` に依存させないこと。**
 * 依存させると `next/dynamic` の `loading` の即時評価で recharts が初期バンドルへ戻る。
 */
export function PriceHistoryChartSkeleton() {
  return (
    <div
      className={`${PRICE_HISTORY_CHART_HEIGHT_CLASS} w-full animate-pulse rounded-xl bg-card`}
      aria-hidden="true"
    />
  );
}

/**
 * 価格記録が 0 件のときの空状態表示。
 *
 * `PriceHistoryChart`（recharts 依存）の中ではなく**こちら側に置く**。チャート側に置くと
 * 0 件でも遅延読み込みが走り、スケルトン（256px）から空状態（約 86px）へ縮む
 * 170px のレイアウトシフトが発生する（直下の「この商品を削除」ボタンが 55px 上へ動く。
 * 実測値・レビュー M-1）。0 件では遅延読み込み自体を行わないことで原理的に解消する。
 */
export function PriceHistoryEmpty() {
  return (
    <p className="rounded-xl border border-dashed border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
      価格記録がありません
    </p>
  );
}
