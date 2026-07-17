import { randomUUID } from 'node:crypto';

/**
 * UUID ベースの ID 値オブジェクトの共通基底。
 * 具象クラスは `static generate()` / `static fromString()` を定義し、
 * 生成・復元の入口を保護された `constructor` に限定する。
 *
 * `Brand` には具象クラス名のリテラル型を渡す（例: `Identifier<'RecipeId'>`）。
 * private フィールドを基底で共有すると全 ID クラスが構造的に互換になり、
 * 集約をまたぐ ID の混同（`recipeId.equals(mealPlanId)` 等）がコンパイルエラーに
 * ならなくなるため、ファントムブランドで公称型付けを維持する。
 */
export abstract class Identifier<Brand extends string> {
  declare private readonly _brand: Brand;

  protected constructor(private readonly identifierValue: string) {}

  equals(other: this): boolean {
    return this.identifierValue === other.identifierValue;
  }

  get value(): string {
    return this.identifierValue;
  }
}

export function generateId(): string {
  return randomUUID();
}
