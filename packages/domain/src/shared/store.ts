import { randomUUID } from 'node:crypto';

export class StoreId {
  private constructor(private readonly storeIdValue: string) {}

  static generate(): StoreId {
    return new StoreId(randomUUID());
  }

  static fromString(value: string): StoreId {
    return new StoreId(value);
  }

  equals(other: StoreId): boolean {
    return this.storeIdValue === other.storeIdValue;
  }

  get value(): string {
    return this.storeIdValue;
  }
}

/**
 * 店舗名の比較用正規化（前後空白除去 + NFKC 正規化）。同名登録の拒否（ADR-0013）に用い、
 * "ライフ" と " ライフ "、"業務スーパー" と "業務ｽｰﾊﾟｰ" を同一視する。表示には原文を使う。
 *
 * 大文字小文字は同一視しない（"Life" と "life" は別店舗）。NFKC は全角英数の幅の統一までを
 * 担う。正規化規則は `normalizeUnit` と揃えており、SQL 側では正規化しない（ADR-0013）。
 */
export function normalizeStoreName(name: string): string {
  return name.trim().normalize('NFKC');
}

export interface StoreCreateInput {
  name: string;
}

export interface StoreProps {
  id: StoreId;
  name: string;
  createdAt: Date;
}

export class Store {
  private constructor(
    private readonly storeId: StoreId,
    private readonly storeName: string,
    private readonly createdDate: Date,
  ) {}

  static create(input: StoreCreateInput): Store {
    if (input.name.trim() === '') {
      throw new Error('Store name is required');
    }

    return new Store(StoreId.generate(), input.name, new Date());
  }

  static reconstruct(props: StoreProps): Store {
    return new Store(props.id, props.name, new Date(props.createdAt));
  }

  get id(): StoreId {
    return this.storeId;
  }

  get name(): string {
    return this.storeName;
  }

  get createdAt(): Date {
    return new Date(this.createdDate);
  }
}
