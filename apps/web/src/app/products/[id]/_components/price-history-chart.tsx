'use client';

import {
  formatDate,
  formatYen,
  sortPriceHistoryByObservedAt,
} from '@/app/products/_utils/product-format';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { PriceRecordDto } from '@cookpit/application';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

interface Props {
  priceHistory: PriceRecordDto[];
}

interface ChartPoint {
  observedAt: string;
  label: string;
  [storeId: string]: string | number;
}

interface StoreSeries {
  storeId: string;
  storeName: string;
  color: string;
}

const CHART_COLORS = ['#d8552f', '#2f7d7e', '#7d5fff', '#b7791f', '#4f7a2f'];

function storeLabel(record: PriceRecordDto): string {
  return record.storeName.trim() === '' ? '店舗未設定' : record.storeName;
}

function buildSeries(priceHistory: PriceRecordDto[]): StoreSeries[] {
  const seenStoreIds = new Set<string>();
  const series: StoreSeries[] = [];

  for (const record of sortPriceHistoryByObservedAt(priceHistory)) {
    if (seenStoreIds.has(record.storeId)) {
      continue;
    }

    seenStoreIds.add(record.storeId);
    series.push({
      storeId: record.storeId,
      storeName: storeLabel(record),
      color: CHART_COLORS[series.length % CHART_COLORS.length],
    });
  }

  return series;
}

function buildChartData(priceHistory: PriceRecordDto[]): ChartPoint[] {
  const points = new Map<string, ChartPoint>();

  for (const record of sortPriceHistoryByObservedAt(priceHistory)) {
    const point = points.get(record.observedAt) ?? {
      observedAt: record.observedAt,
      label: formatDate(record.observedAt),
    };
    point[record.storeId] = record.unitPriceAmount;
    points.set(record.observedAt, point);
  }

  return Array.from(points.values());
}

function buildChartConfig(series: StoreSeries[]): ChartConfig {
  const config: ChartConfig = {};
  for (const item of series) {
    config[item.storeId] = {
      label: item.storeName,
      color: item.color,
    };
  }
  return config;
}

function formatYAxisTick(value: number | string): string {
  return typeof value === 'number' ? formatYen(value) : value;
}

export function PriceHistoryChart({ priceHistory }: Props) {
  if (priceHistory.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
        価格記録がありません
      </p>
    );
  }

  const series = buildSeries(priceHistory);
  const chartData = buildChartData(priceHistory);
  const chartConfig = buildChartConfig(series);

  return (
    <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto rounded-xl bg-card p-2">
      <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 6, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={58}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatYAxisTick}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap justify-start" />} />
        {series.map((item) => (
          <Line
            key={item.storeId}
            type="monotone"
            dataKey={item.storeId}
            name={item.storeName}
            stroke={`var(--color-${item.storeId})`}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
