/**
 * Date を DTO 境界へ渡す `YYYY-MM-DD` 文字列へ変換する。
 *
 * `toISOString()` は UTC へ変換するため、負のタイムゾーンオフセット下では日付が前日に
 * ずれる。日付だけを持つ値（買い物日・賞味期限など）はローカルの年月日をそのまま渡す。
 * Infrastructure 側の `date` 列との往復整合も同じ規則で保たれる。
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
