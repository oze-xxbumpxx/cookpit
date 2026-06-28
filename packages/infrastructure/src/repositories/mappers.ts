import type { Unit } from '@cookpit/domain/src/shared/unit';

export function toUnit(value: string): Unit {
  switch (value) {
    case 'g':
    case 'kg':
    case 'ml':
    case 'l':
    case '大さじ':
    case '小さじ':
    case 'cup':
    case '個':
    case '本':
    case '枚':
    case '玉':
    case '尾':
    case '切れ':
    case '束':
    case '袋':
    case '缶':
    case '合':
      return value;
    default:
      throw new Error(`Unknown unit: ${value}`);
  }
}
