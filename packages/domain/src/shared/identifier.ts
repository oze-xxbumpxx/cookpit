import { randomUUID } from 'node:crypto';

/**
 * UUID ベースの ID 値オブジェクトの共通基底。
 * 具象クラスは `static generate()` / `static fromString()` を定義し、
 * 生成・復元の入口を保護された `constructor` に限定する。
 * `equals` は同一具象型どうしの値比較のみを許す（`this` 型で型安全を担保）。
 */
export abstract class Identifier {
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
