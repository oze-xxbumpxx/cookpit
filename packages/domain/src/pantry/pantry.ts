import type { ProductId } from '../product/product-id';
import { Quantity } from '../shared/quantity';
import type { ShoppingItemId } from '../shopping-list/shopping-item-id';
import { PantryId } from './pantry-id';
import { StockId } from './stock-id';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface CreateStockInput {
  productId: ProductId | null;
  displayName: string;
  amount: Quantity;
  purchasedAt: Date;
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
  sourceShoppingItemId: ShoppingItemId | null;
}

export interface StockProps {
  id: StockId;
  productId: ProductId | null;
  displayName: string;
  amount: Quantity;
  purchasedAt: Date;
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
  sourceShoppingItemId: ShoppingItemId | null;
}

export class Stock {
  private constructor(
    private readonly stockId: StockId,
    private readonly stockProductId: ProductId | null,
    private readonly stockDisplayName: string,
    private stockAmount: Quantity,
    private readonly stockPurchasedAt: Date,
    private readonly stockExpiresAt: Date | null,
    private readonly stockStoredLocation: StorageLocation | null,
    private readonly stockSourceShoppingItemId: ShoppingItemId | null,
  ) {}

  /** @throws Error displayName が空白のみ、または amount が 0 以下の場合 */
  static create(input: CreateStockInput): Stock {
    if (input.displayName.trim() === '') {
      throw new Error('Display name is required');
    }
    if (input.amount.value <= 0) {
      throw new Error('Stock amount must be positive');
    }

    return new Stock(
      StockId.generate(),
      input.productId,
      input.displayName,
      input.amount,
      input.purchasedAt,
      input.expiresAt,
      input.storedLocation,
      input.sourceShoppingItemId,
    );
  }

  static reconstruct(props: StockProps): Stock {
    return new Stock(
      props.id,
      props.productId,
      props.displayName,
      props.amount,
      props.purchasedAt,
      props.expiresAt,
      props.storedLocation,
      props.sourceShoppingItemId,
    );
  }

  /**
   * 消費量が現在量以上の場合は全量消費（残 0）にクランプする（S-7 案 α）。
   *
   * @throws Error amount の単位が現在量の単位と一致しない場合
   */
  consume(amount: Quantity): void {
    if (amount.unit !== this.stockAmount.unit) {
      throw new Error('Cannot consume with a different unit');
    }
    this.stockAmount =
      amount.value >= this.stockAmount.value
        ? Quantity.of(0, this.stockAmount.unit)
        : this.stockAmount.subtract(amount);
  }

  isEmpty(): boolean {
    return this.stockAmount.value === 0;
  }

  get id(): StockId {
    return this.stockId;
  }

  get productId(): ProductId | null {
    return this.stockProductId;
  }

  get displayName(): string {
    return this.stockDisplayName;
  }

  get amount(): Quantity {
    return this.stockAmount;
  }

  get purchasedAt(): Date {
    return new Date(this.stockPurchasedAt);
  }

  get expiresAt(): Date | null {
    return this.stockExpiresAt === null ? null : new Date(this.stockExpiresAt);
  }

  get storedLocation(): StorageLocation | null {
    return this.stockStoredLocation;
  }

  get sourceShoppingItemId(): ShoppingItemId | null {
    return this.stockSourceShoppingItemId;
  }
}

export interface PantryProps {
  id: PantryId;
  stocks: Stock[];
}

/**
 * 在庫（Pantry）集約。単一世帯に常にちょうど 1 つ存在する（S-1）。
 * 「1 買い物完了品目 : 最大 1 Stock」はこの集約単体では保証できず、
 * Application 層の事前スキップ + DB の source_shopping_item_id UNIQUE の
 * 二段で守る（S-3）。
 */
export class Pantry {
  private constructor(
    private readonly pantryId: PantryId,
    private pantryStocks: Stock[],
  ) {}

  static create(): Pantry {
    return new Pantry(PantryId.singleton(), []);
  }

  static reconstruct(props: PantryProps): Pantry {
    return new Pantry(props.id, [...props.stocks]);
  }

  addStock(input: CreateStockInput): StockId {
    const stock = Stock.create(input);
    this.pantryStocks.push(stock);
    return stock.id;
  }

  /** @throws Error stockId の Stock が存在しない、または amount の単位が一致しない場合 */
  consumeStock(stockId: StockId, amount: Quantity): void {
    const stock = this.findStock(stockId);
    stock.consume(amount);
    if (stock.isEmpty()) {
      this.pantryStocks = this.pantryStocks.filter((candidate) => !candidate.id.equals(stockId));
    }
  }

  /**
   * 残量に関わらず全量を集約から取り除く（部分廃棄はない）。
   *
   * @throws Error stockId の Stock が存在しない場合
   */
  discardStock(stockId: StockId): void {
    this.findStock(stockId);
    this.pantryStocks = this.pantryStocks.filter((candidate) => !candidate.id.equals(stockId));
  }

  /** 買い物完了の再実行時、同一 ShoppingItem 由来の Stock 追加をスキップする判定に使う（S-3）。 */
  hasStockFromShoppingItem(itemId: ShoppingItemId): boolean {
    return this.pantryStocks.some(
      (stock) => stock.sourceShoppingItemId !== null && stock.sourceShoppingItemId.equals(itemId),
    );
  }

  get id(): PantryId {
    return this.pantryId;
  }

  get stocks(): Stock[] {
    return [...this.pantryStocks];
  }

  private findStock(stockId: StockId): Stock {
    const stock = this.pantryStocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new Error('Stock not found');
    }
    return stock;
  }
}
