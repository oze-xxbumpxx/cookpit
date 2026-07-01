import type { PriceRecordDto } from '@cookpit/application';

function observedAtTime(record: PriceRecordDto): number {
  const time = Date.parse(record.observedAt);
  return Number.isNaN(time) ? 0 : time;
}

export function findLatestPriceRecord(priceHistory: PriceRecordDto[]): PriceRecordDto | null {
  return priceHistory.reduce<PriceRecordDto | null>((latest, record) => {
    if (latest === null) {
      return record;
    }
    return observedAtTime(record) > observedAtTime(latest) ? record : latest;
  }, null);
}

export function sortPriceHistoryByObservedAt(priceHistory: PriceRecordDto[]): PriceRecordDto[] {
  return [...priceHistory].sort((a, b) => observedAtTime(a) - observedAtTime(b));
}

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function unitPriceBasisLabel(unit: PriceRecordDto['packageSizeUnit']): string {
  if (unit === 'g' || unit === 'kg') {
    return '100g';
  }
  if (unit === 'ml' || unit === 'l') {
    return '100ml';
  }
  return `1${unit}`;
}
