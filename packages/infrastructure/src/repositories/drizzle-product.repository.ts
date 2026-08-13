import { and, count, eq, notInArray, sql } from 'drizzle-orm';
import {
  Money,
  PriceRecord,
  PriceRecordId,
  Product,
  ProductId,
  Quantity,
  StoreId,
} from '@cookpit/domain';
import type { ProductRepository } from '@cookpit/domain';
import type { DrizzleClient } from '../db/client';
import {
  priceRecords,
  products,
  type NewPriceRecordRow,
  type NewProductRow,
  type PriceRecordRow,
  type ProductRow,
} from '../db/schema';
import { toUnit } from './mappers';
import type { DrizzleUnitOfWork } from '../uow/drizzle-unit-of-work';

interface ProductWithPriceRecordRow {
  product: ProductRow;
  priceRecord: PriceRecordRow | null;
}

interface ProductGroup {
  product: ProductRow;
  priceRecords: PriceRecordRow[];
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly unitOfWork: DrizzleUnitOfWork) {}

  private get db(): DrizzleClient {
    return this.unitOfWork.client;
  }

  async findById(id: ProductId): Promise<Product | null> {
    const rows = await this.db
      .select({
        product: products,
        priceRecord: priceRecords,
      })
      .from(products)
      .leftJoin(priceRecords, eq(products.id, priceRecords.productId))
      .where(eq(products.id, id.value));

    if (rows.length === 0) {
      return null;
    }

    return this.toProducts(rows)[0] ?? null;
  }

  async findAll(): Promise<Product[]> {
    const rows = await this.db
      .select({
        product: products,
        priceRecord: priceRecords,
      })
      .from(products)
      .leftJoin(priceRecords, eq(products.id, priceRecords.productId))
      .orderBy(products.createdAt);

    return this.toProducts(rows);
  }

  async save(product: Product): Promise<void> {
    const productRow = this.toProductRow(product);
    await this.db
      .insert(products)
      .values(productRow)
      .onConflictDoUpdate({
        target: products.id,
        set: {
          name: productRow.name,
          aliases: productRow.aliases,
          category: productRow.category,
          defaultUnit: productRow.defaultUnit,
          updatedAt: productRow.updatedAt,
        },
      });

    const priceRecordRows = this.toPriceRecordRows(product);
    const currentIds = priceRecordRows.map((row) => row.id);

    if (currentIds.length > 0) {
      await this.db
        .delete(priceRecords)
        .where(
          and(
            eq(priceRecords.productId, product.id.value),
            notInArray(priceRecords.id, currentIds),
          ),
        );
    } else {
      await this.db.delete(priceRecords).where(eq(priceRecords.productId, product.id.value));
    }

    if (priceRecordRows.length > 0) {
      // Batch upsert: with an array of values, `set` must reference the
      // conflicting row via `excluded.*` so each row updates to its own values.
      await this.db
        .insert(priceRecords)
        .values(priceRecordRows)
        .onConflictDoUpdate({
          target: priceRecords.id,
          set: {
            productId: sql`excluded.product_id`,
            storeId: sql`excluded.store_id`,
            priceAmount: sql`excluded.price_amount`,
            unitPriceAmount: sql`excluded.unit_price_amount`,
            packageSizeValue: sql`excluded.package_size_value`,
            packageSizeUnit: sql`excluded.package_size_unit`,
            observedAt: sql`excluded.observed_at`,
          },
        });
    }
  }

  async delete(id: ProductId): Promise<void> {
    await this.db.delete(products).where(eq(products.id, id.value));
  }

  async countPriceRecordsByStore(storeId: StoreId): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(priceRecords)
      .where(eq(priceRecords.storeId, storeId.value));

    return rows[0]?.value ?? 0;
  }

  async deletePriceRecordsByStore(storeId: StoreId): Promise<void> {
    await this.db.delete(priceRecords).where(eq(priceRecords.storeId, storeId.value));
  }

  private toProducts(rows: ProductWithPriceRecordRow[]): Product[] {
    const groups = new Map<string, ProductGroup>();

    for (const row of rows) {
      let group = groups.get(row.product.id);
      if (group === undefined) {
        group = {
          product: row.product,
          priceRecords: [],
        };
        groups.set(row.product.id, group);
      }

      if (row.priceRecord !== null) {
        group.priceRecords.push(row.priceRecord);
      }
    }

    return [...groups.values()].map((group) => this.toEntity(group.product, group.priceRecords));
  }

  private toEntity(productRow: ProductRow, priceRecordRows: PriceRecordRow[]): Product {
    return Product.reconstruct({
      id: ProductId.fromString(productRow.id),
      name: productRow.name,
      aliases: [...productRow.aliases],
      category: productRow.category,
      defaultUnit: toUnit(productRow.defaultUnit),
      priceHistory: priceRecordRows.map((row) =>
        PriceRecord.reconstruct({
          id: PriceRecordId.fromString(row.id),
          storeId: StoreId.fromString(row.storeId),
          price: Money.of(Number(row.priceAmount), 'JPY'),
          unitPrice: Money.of(Number(row.unitPriceAmount), 'JPY'),
          packageSize: Quantity.of(Number(row.packageSizeValue), toUnit(row.packageSizeUnit)),
          observedAt: row.observedAt,
        }),
      ),
      createdAt: productRow.createdAt,
      updatedAt: productRow.updatedAt,
    });
  }

  private toProductRow(product: Product): NewProductRow {
    return {
      id: product.id.value,
      name: product.name,
      aliases: product.aliases,
      category: product.category,
      defaultUnit: product.defaultUnit,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private toPriceRecordRows(product: Product): NewPriceRecordRow[] {
    return product.priceHistory.map((record) => ({
      id: record.id.value,
      productId: product.id.value,
      storeId: record.storeId.value,
      priceAmount: record.price.amount.toString(),
      unitPriceAmount: record.unitPrice.amount.toString(),
      packageSizeValue: record.packageSize.value.toString(),
      packageSizeUnit: record.packageSize.unit,
      observedAt: record.observedAt,
    }));
  }
}
