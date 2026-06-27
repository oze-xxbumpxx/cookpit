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
