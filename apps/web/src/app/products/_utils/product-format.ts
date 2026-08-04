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

type PackageSizeUnit = PriceRecordDto['packageSizeUnit'];

interface UnitPriceBasis {
  /** 保存されている正準値（100g / 100ml / 1 単位あたり）に掛ける倍率。 */
  factor: number;
  label: string;
}

// 単位の判定は packages/domain の UnitPriceCalculator と**同じ厳密一致**にする。
// 表示側だけ正規化（toLowerCase / NFKC）を足すと、'KG' のような入力で
// 「正準値は 1 単位あたり・表示は 1kg 基準」という食い違いが生まれ、単価が 10 倍ズレる。
const WEIGHT_BASIS: ReadonlyMap<string, UnitPriceBasis> = new Map([
  ['g', { factor: 1, label: '100g' }],
  ['kg', { factor: 10, label: '1kg' }],
]);
const VOLUME_BASIS: ReadonlyMap<string, UnitPriceBasis> = new Map([
  ['ml', { factor: 1, label: '100ml' }],
  ['l', { factor: 10, label: '1L' }],
]);

/**
 * 単価の表示基準を、価格を記録したときの内容量の単位から決める。
 * 1kg で買うものは「◯円 / 1kg」、小分けの g で買うものは従来どおり「◯円 / 100g」で読める。
 */
function unitPriceBasis(unit: PackageSizeUnit): UnitPriceBasis {
  return WEIGHT_BASIS.get(unit) ?? VOLUME_BASIS.get(unit) ?? { factor: 1, label: `1${unit}` };
}

/**
 * 単価を「298円 / 1kg」の形に整形する。
 *
 * `unitPriceAmount` は DB に保存された正準値（重量は 100g・容量は 100ml・その他は 1 単位あたり）で、
 * 店舗間の比較はこの正準値で行われる。ここでは**表示だけ**を内容量の単位に合わせて換算する。
 */
export function formatUnitPrice(unitPriceAmount: number, unit: PackageSizeUnit): string {
  const basis = unitPriceBasis(unit);
  const amount = Math.round(unitPriceAmount * basis.factor * 10) / 10;
  return `${formatYen(amount)} / ${basis.label}`;
}
