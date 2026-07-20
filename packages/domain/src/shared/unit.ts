export type Unit =
  // 重量
  | 'g'
  | 'kg'
  // 容量
  | 'ml'
  | 'l'
  // 調理単位
  | '大さじ'
  | '小さじ'
  | 'cup'
  // 個数・形状
  | '個'
  | '本'
  | '枚'
  | '玉'
  | '尾'
  | '切れ'
  // まとまり
  | '束'
  | '袋'
  | '缶'
  | '合';

const countableUnits: ReadonlySet<Unit> = new Set<Unit>([
  '個',
  '本',
  '枚',
  '玉',
  '尾',
  '切れ',
  '束',
  '袋',
  '缶',
]);

/**
 * 単位が離散的（数えられる）かを返す。買い物リスト生成時の在庫引き算で、
 * 買う量を切り上げる対象単位の判定に使う。`合`（米の計量単位）・`cup`・
 * `大さじ`/`小さじ`・`g`/`kg`/`ml`/`l` は連続量として false を返す。
 */
export function isCountableUnit(unit: Unit): boolean {
  return countableUnits.has(unit);
}
