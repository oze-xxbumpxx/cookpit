import type { Pantry } from './pantry';

export interface PantryRepository {
  /** 単一世帯の Pantry を返す。在庫 0 件でも空の Pantry を返す（null を返さない）。 */
  find(): Promise<Pantry>;
  save(pantry: Pantry): Promise<void>;
}
