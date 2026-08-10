export class StoreId {
  private constructor(private readonly storeIdValue: string) {}

  static generate(): StoreId {
    return new StoreId(crypto.randomUUID());
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
    private storeName: string,
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

  /**
   * 店舗名を変更する。空文字列・空白のみは拒否する（create() と同じ制約）。
   * 名前の一意性検査（同名禁止・自分自身の除外）はコレクション制約のため、
   * Entity ではなく RenameStoreUseCase が担う（CreateStoreUseCase と同じ責務分担、ADR-0013）。
   *
   * @throws Error name が空文字列・空白のみの場合
   */
  rename(name: string): void {
    if (name.trim() === '') {
      throw new Error('Store name is required');
    }
    this.storeName = name;
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
