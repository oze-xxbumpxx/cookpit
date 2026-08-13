import { eq } from 'drizzle-orm';
import { normalizeStoreName, Store, StoreId } from '@cookpit/domain';
import type { StoreRepository } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';
import { stores, type StoreRow, type NewStoreRow } from '../db/schema';
import type { DrizzleUnitOfWork } from '../uow/drizzle-unit-of-work';

export class DrizzleStoreRepository implements StoreRepository {
  constructor(private readonly unitOfWork: DrizzleUnitOfWork) {}

  private get db(): DrizzleClient {
    return this.unitOfWork.client;
  }

  async findById(id: StoreId): Promise<Store | null> {
    const rows = await this.db.select().from(stores).where(eq(stores.id, id.value)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toEntity(row);
  }

  async findAll(): Promise<Store[]> {
    const rows = await this.db.select().from(stores).orderBy(stores.createdAt);
    return rows.map((row) => this.toEntity(row));
  }

  async findByNormalizedName(normalizedName: string): Promise<Store | null> {
    // 正規化（NFKC）を SQL 側で行わず、全件取得してアプリ側で比較する。正規化規則を SQL と
    // TypeScript の 2 か所に持つと乖離するため（ADR-0013）。上限 3 件の小さなテーブル。
    const rows = await this.db.select().from(stores);
    const row = rows.find((candidate) => normalizeStoreName(candidate.name) === normalizedName);
    if (row === undefined) {
      return null;
    }
    return this.toEntity(row);
  }

  async save(store: Store): Promise<void> {
    const row = this.toRow(store);
    await this.db
      .insert(stores)
      .values(row)
      .onConflictDoUpdate({
        target: stores.id,
        set: {
          name: row.name,
        },
      });
  }

  async delete(id: StoreId): Promise<void> {
    await this.db.delete(stores).where(eq(stores.id, id.value));
  }

  private toEntity(row: StoreRow): Store {
    return Store.reconstruct({
      id: StoreId.fromString(row.id),
      name: row.name,
      createdAt: row.createdAt,
    });
  }

  private toRow(store: Store): NewStoreRow {
    return {
      id: store.id.value,
      name: store.name,
      createdAt: store.createdAt,
    };
  }
}
