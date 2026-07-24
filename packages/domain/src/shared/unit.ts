// 単位は自由記述（任意の文字列）を許容する（項目3・Sprint1 のプリセット固定方針を撤回）。
export type Unit = string;

// 可算（数えられる）単位の既知集合。自由入力の未知単位は非可算（切り上げしない）として扱う。
const countableUnits: ReadonlySet<string> = new Set<string>([
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
 * 単位表記を正規化する（前後空白除去 + NFKC 正規化）。集計キー・在庫引き算のマッチングや
 * 可算判定に用い、"個" と " 個 "、半角/全角の表記ゆれを同一視する。表示には原文を使う。
 */
export function normalizeUnit(unit: string): string {
  return unit.trim().normalize('NFKC');
}

/**
 * 単位が離散的（数えられる）かを返す。買い物リスト生成時の在庫引き算で、買う量を切り上げる
 * 対象単位の判定に使う。既知の可算プリセットのみ true。自由入力の未知単位・連続量
 * （g/kg/ml/l/大さじ/小さじ/cup/合 等）は false。
 */
export function isCountableUnit(unit: Unit): boolean {
  return countableUnits.has(normalizeUnit(unit));
}
