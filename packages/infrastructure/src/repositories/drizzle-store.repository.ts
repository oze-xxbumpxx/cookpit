import { eq } from 'drizzle-orm';
import { Store, StoreId } from '@cookpit/domain';
import type { StoreRepository } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';
import { stores, type StoreRow, type NewStoreRow } from '../db/schema';

export class DrizzleStoreRepository implements StoreRepository {
  constructor(private readonly db: DrizzleClient) {}

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
