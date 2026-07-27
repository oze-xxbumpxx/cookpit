// 内容量欄の入力例を単位から決める。プレースホルダとバリデーションエラーの両方が
// これを使い、同じ例を表示する（食い違って「例：300個」と「例：300g」が混在していた）。

/** 数量 300 が現実的な単位。これ以外はすべて 1 で例示する。 */
const LARGE_QUANTITY_UNITS: ReadonlySet<string> = new Set<string>(['g', 'ml']);

/** 単位が不明なときの既定例。 */
const FALLBACK_EXAMPLE = '300g';

/**
 * 内容量の入力例を組み立てる（例: `300g` / `1個` / `1kg`）。
 *
 * 数量は g / ml だけ 300 とし、それ以外はすべて 1 にする。可算単位（個・本・枚…）で
 * 「300個」、大きい連続量（kg・l）で「300kg」といった非現実的な例が出るのを防ぐ。
 *
 * 可算判定（Domain の `isCountableUnit`）は使わない。「g / ml 以外は 1」で必要な
 * 出し分けがすべて成立し、自由入力の未知単位（例: 杯）も安全側の 1 に落ちるため。
 * Domain を値として import しない理由は `store-name.ts` と同じ（node:crypto の混入）。
 *
 * @param unit 商品の基本単位。空文字・空白のみのときは既定例を返す
 */
export function packageSizeExample(unit: string): string {
  const normalized = unit.trim().normalize('NFKC');
  if (normalized === '') {
    return FALLBACK_EXAMPLE;
  }

  const quantity = LARGE_QUANTITY_UNITS.has(normalized.toLowerCase()) ? 300 : 1;
  return `${quantity}${normalized}`;
}
