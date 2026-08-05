import type { PriceRecordDto, ProductDto, ShoppingItemDto } from '@cookpit/application';

export interface EstimatedPriceDiff {
  cheapestStoreId: string;
  cheapestStoreName: string;
  estimatedDiffYen: number;
}

export interface StoreUnitPriceEntry {
  storeId: string;
  storeName: string;
  unitPriceAmount: number;
  isCheapest: boolean;
  /**
   * isCheapest のとき 0。非最安でも単価差が 0.5 円未満なら丸めで 0 になりうる
   * （unitPriceAmount は小数第 1 位まで保持されるため）。
   */
  diffFromCheapestYen: number;
}

export interface StoreUnitPriceBreakdown {
  /** '100g' | '100ml' | `1${unit}` */
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

type UnitBasisKind = 'weight' | 'volume' | 'other';

interface UnitBasis {
  kind: UnitBasisKind;
  /** 記録の値を正準単位（g / ml）へ換算する倍率。 */
  canonicalFactor: number;
  /** 正準値の分母（重量・容量は 100、それ以外は 1）。 */
  divisor: number;
}

// UnitPriceCalculator（packages/domain/src/product/unit-price-calculator.ts）の
// WEIGHT_UNITS / VOLUME_UNITS と同一の厳密一致で判定する。normalizeUnit / toLowerCase は使わない
// （2026-07-27 の「単価 10 倍ズレ」事故と同型の不具合を再発させるため。表示側の追加正規化は禁止）。
function unitBasis(unit: string): UnitBasis {
  switch (unit) {
    case 'g':
      return { kind: 'weight', canonicalFactor: 1, divisor: 100 };
    case 'kg':
      return { kind: 'weight', canonicalFactor: 1000, divisor: 100 };
    case 'ml':
      return { kind: 'volume', canonicalFactor: 1, divisor: 100 };
    case 'l':
      return { kind: 'volume', canonicalFactor: 1000, divisor: 100 };
    default:
      return { kind: 'other', canonicalFactor: 1, divisor: 1 };
  }
}

// 店舗ごとに observedAt 最大の 1 件へ絞る。storeName === '' の記録（削除済み店舗の防御的縮退。
// product.mapper.ts の storeMap.get(...) ?? ''）は除外する。呼び出し元が保持する
// product.priceHistory への参照は書き換えない（新しい配列を返すのみ）。
function pickLatestRecordPerStore(priceHistory: PriceRecordDto[]): PriceRecordDto[] {
  const latestByStore = new Map<string, PriceRecordDto>();
  for (const record of priceHistory) {
    if (record.storeName === '') {
      continue;
    }
    const current = latestByStore.get(record.storeId);
    // 同一店舗・同一 observedAt が万一並んだ場合は配列走査順で後に見つかった方を採用する
    // （決定的な挙動にするための実装上の取り決め。通常運用では発生しない）。
    if (current === undefined || Date.parse(record.observedAt) >= Date.parse(current.observedAt)) {
      latestByStore.set(record.storeId, record);
    }
  }
  return [...latestByStore.values()];
}

// 内訳の基準となる単位区分を「記録数が最も多い kind」で決める。
// unitPriceAmount を kind をまたいで数値比較してはならない（100g 単価・100ml 単価・
// 1 単位あたりの価格は次元が違うため大小に意味が無く、少数派の kind がたまたま小さい値だと
// 比較可能な多数派が丸ごと捨てられて内訳が静かに消える）。
// 同数のときは weight → volume → other の固定順で決める（決定的な挙動にするため）。
const BASIS_KIND_PRIORITY: UnitBasisKind[] = ['weight', 'volume', 'other'];

function pickBasisKind(records: PriceRecordDto[]): UnitBasisKind {
  const counts = new Map<UnitBasisKind, number>();
  for (const record of records) {
    const kind = unitBasis(record.packageSizeUnit).kind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let basisKind: UnitBasisKind = BASIS_KIND_PRIORITY[0];
  let maxCount = -1;
  for (const kind of BASIS_KIND_PRIORITY) {
    const count = counts.get(kind) ?? 0;
    if (count > maxCount) {
      basisKind = kind;
      maxCount = count;
    }
  }
  return basisKind;
}

interface TotalCandidate {
  storeId: string;
  storeName: string;
  estimatedTotal: number;
}

/**
 * 品目の必要量を最安店舗で買った場合と 2 番目に安い店舗で買った場合の概算総額差を求める。
 *
 * 次のいずれかに当たるときは `null`（＝非表示への縮退）を返す。
 * - 品目に `productId` / `requiredAmount` が無い、または商品に価格記録が無い
 * - 必要量と単位区分（重量・容量・その他）が一致する店舗が 2 件未満
 * - 丸めた総額差が 0 円以下
 *
 * `product` は `Map.get()` の戻り値を素通しするため `undefined` を受ける。
 */
export function estimateItemPriceDiff(
  item: ShoppingItemDto,
  product: ProductDto | undefined,
): EstimatedPriceDiff | null {
  if (item.productId === null) {
    return null;
  }
  if (item.requiredAmount === null) {
    return null;
  }
  if (product === undefined || product.priceHistory.length === 0) {
    return null;
  }

  const requiredAmount = item.requiredAmount;
  const requiredBasis = unitBasis(requiredAmount.unit);
  const latestRecords = pickLatestRecordPerStore(product.priceHistory);

  const candidates: TotalCandidate[] = [];
  for (const record of latestRecords) {
    const recordBasis = unitBasis(record.packageSizeUnit);
    if (recordBasis.kind !== requiredBasis.kind) {
      continue;
    }
    // 'other' は「300g」と「1袋あたり」のような異なる実世界の単位を同一視しないよう、
    // 生の単位文字列も一致させる（weight/volume は正準単位への換算で十分に同一視できる）。
    if (requiredBasis.kind === 'other' && record.packageSizeUnit !== requiredAmount.unit) {
      continue;
    }
    // 換算係数は必ず requiredBasis（必要量側）を使う。record.unitPriceAmount は正準単位
    // （g/ml なら 100 単位あたり）を分母に持つ値なので、掛ける側（必要量）もその正準単位へ
    // 換算した数量でなければならない。recordBasis（価格記録側）の canonicalFactor/divisor を
    // ここで使うと、canonicalFactor が単位ごとに異なる（g=1, kg=1000）ため桁がズレる
    // （2026-07-27 の「単価 10 倍ズレ」事故と同型。最大 1000 倍ズレる）。
    const estimatedTotal =
      record.unitPriceAmount *
      ((requiredAmount.value * requiredBasis.canonicalFactor) / requiredBasis.divisor);
    candidates.push({ storeId: record.storeId, storeName: record.storeName, estimatedTotal });
  }

  if (candidates.length < 2) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => a.estimatedTotal - b.estimatedTotal);
  const estimatedDiffYen = Math.round(sorted[1].estimatedTotal - sorted[0].estimatedTotal);
  if (estimatedDiffYen <= 0) {
    return null;
  }

  return {
    cheapestStoreId: sorted[0].storeId,
    cheapestStoreName: sorted[0].storeName,
    estimatedDiffYen,
  };
}

/**
 * 店舗ごとの最新価格記録から、単価の安い順に並べた内訳を組み立てる。
 *
 * 基準となる単位区分は記録数が最も多い kind（同数なら weight → volume → other）で、
 * 異なる区分の記録は内訳から除外する。次のいずれかに当たるときは `null` を返す。
 * - 商品が無い、または価格記録が無い
 * - `storeName` が空（＝参照先店舗が解決できない）記録を除くと 2 件未満
 * - 基準区分に一致する記録が 2 件未満
 *
 * `product` は `Map.get()` の戻り値を素通しするため `undefined` を受ける。
 * 引数の `priceHistory` は書き換えない。
 */
export function buildStoreUnitPriceBreakdown(
  product: ProductDto | undefined,
): StoreUnitPriceBreakdown | null {
  if (product === undefined || product.priceHistory.length === 0) {
    return null;
  }

  const latestRecords = pickLatestRecordPerStore(product.priceHistory);
  // pickLatestRecordPerStore が storeName === '' を全除外すると空配列になりうる
  // （設計書 §縮退ケース一覧 #7「候補から除外」＝非表示への縮退）。
  if (latestRecords.length < 2) {
    return null;
  }
  const basisKind = pickBasisKind(latestRecords);

  // kind === 'other' の内訳比較は packageSizeUnit の生文字列一致までは要求しない（総額差とは異なる）。
  // UnitPriceCalculator 自体が「重量・容量以外はすべて『1 単位あたり』」として正準化しており、
  // 単位の実世界の意味を区別しない設計をすでに踏襲しているため（既存の簡略化を踏襲するだけで、
  // 本機能が新たに導入する制約緩和ではない）。
  const filtered = latestRecords.filter(
    (record) => unitBasis(record.packageSizeUnit).kind === basisKind,
  );
  if (filtered.length < 2) {
    return null;
  }

  const sorted = [...filtered].sort((a, b) => a.unitPriceAmount - b.unitPriceAmount);
  const cheapestValue = sorted[0].unitPriceAmount;

  const entries: StoreUnitPriceEntry[] = sorted.map((record) => {
    const isCheapest = record.unitPriceAmount === cheapestValue;
    return {
      storeId: record.storeId,
      storeName: record.storeName,
      unitPriceAmount: record.unitPriceAmount,
      isCheapest,
      diffFromCheapestYen: isCheapest ? 0 : Math.round(record.unitPriceAmount - cheapestValue),
    };
  });

  const basisLabel =
    basisKind === 'weight'
      ? '100g'
      : basisKind === 'volume'
        ? '100ml'
        : `1${sorted[0].packageSizeUnit}`;

  return { basisLabel, entries };
}

/**
 * 内訳 1 行の差額ラベルを組み立てる。
 *
 * 非最安でも単価差が 0.5 円未満だと丸めで 0 になるため、そのまま `+0円` と出すと
 * 「差が無いのに片方だけ最安」に見える。丸め後 0 の行は「ほぼ同額」に置き換える。
 */
export function formatStoreUnitPriceDiffLabel(entry: StoreUnitPriceEntry): string {
  if (entry.isCheapest) {
    return '← 最安';
  }
  if (entry.diffFromCheapestYen === 0) {
    return 'ほぼ同額';
  }
  return `+${entry.diffFromCheapestYen}円`;
}

/** 総額差メッセージ（例: `オーケーの方が約210円安い`）。 */
export function formatEstimatedDiffMessage(diff: EstimatedPriceDiff): string {
  return `${diff.cheapestStoreName}の方が約${diff.estimatedDiffYen}円安い`;
}

/** 金額を桁区切り付きの円表記にする（例: `1,234円`）。 */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}
