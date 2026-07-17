import { Identifier } from '../shared/identifier';

const SINGLETON_VALUE = '00000000-0000-0000-0000-000000000000';

/** 単一世帯を表す固定 ID（S-1）。DB にも API 契約にも現れない、集約の同一性表現専用。 */
export class PantryId extends Identifier<'PantryId'> {
  static fromString(value: string): PantryId {
    return new PantryId(value);
  }

  /** 常にこの固定値を返す。`generate()` は持たない（Pantry は採番されない。D-2）。 */
  static singleton(): PantryId {
    return new PantryId(SINGLETON_VALUE);
  }
}
