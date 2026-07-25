import type { Unit } from '@cookpit/domain';

// 単位は自由記述を許容する（項目3）。DB 上は text のため、そのまま Unit（= string）として返す。
export function toUnit(value: string): Unit {
  return value;
}

/**
 * DB の `date` 列（`YYYY-MM-DD`）をローカル 0 時の Date に復元する。
 * `new Date('YYYY-MM-DD')` は UTC 0 時として解釈され、負のオフセット下で前日に
 * ずれるため、時刻を付けてローカル解釈を強制する。
 */
export function toLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/**
 * Date を DB の `date` 列に渡す `YYYY-MM-DD` 文字列へ変換する。
 * `toISOString()` は UTC 変換で日付がずれるため、ローカルの年月日を組み立てる。
 * `toLocalDate` と往復整合する。
 */
export function toLocalDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}
