import type { Unit } from '@cookpit/domain/src/shared/unit';

// 単位は自由記述を許容する（項目3）。DB 上は text のため、そのまま Unit（= string）として返す。
export function toUnit(value: string): Unit {
  return value;
}
