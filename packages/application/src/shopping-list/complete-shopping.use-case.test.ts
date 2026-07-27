import {
  MealPlan,
  MealPlanId,
  Money,
  Pantry,
  PantryId,
  PriceRecord,
  PriceRecordId,
  Product,
  ProductId,
  Quantity,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
  Stock,
  StockId,
  StoreId,
  WeekIdentifier,
} from '@cookpit/domain';
import type {
  MealPlanRepository,
  MealPlanStatus,
  PantryRepository,
  ProductRepository,
  ShoppingListRepository,
  ShoppingListStatus,
} from '@cookpit/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidStockOperationError } from '../pantry/invalid-stock-operation.error';
import { CompleteShoppingUseCase } from './complete-shopping.use-case';
import type { StockAdditionInputDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

const SHOPPING_LIST_ID = 'shopping-list-1';
const SHOPPING_ITEM_ID_1 = 'shopping-item-1';
const SHOPPING_ITEM_ID_2 = 'shopping-item-2';
const MEAL_PLAN_ID = 'meal-plan-1';
const PRODUCT_ID = 'product-1';
const STORE_ID = 'store-1';

class InMemoryShoppingListRepository implements ShoppingListRepository {
  private readonly map = new Map<string, ShoppingList>();
  public saveCount = 0;

  constructor(private readonly saveEvents: string[]) {}

  async findById(id: ShoppingListId): Promise<ShoppingList | null> {
    return this.map.get(id.value) ?? null;
  }

  async findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null> {
    return [...this.map.values()].find((list) => list.mealPlanId.equals(mealPlanId)) ?? null;
  }

  async save(shoppingList: ShoppingList): Promise<void> {
    this.saveCount += 1;
    this.saveEvents.push('shopping-list');
    this.map.set(shoppingList.id.value, shoppingList);
  }

  async countItemsByStore(storeId: StoreId): Promise<number> {
    return [...this.map.values()].reduce(
      (total, list) => total + list.items.filter((item) => referencesStore(item, storeId)).length,
      0,
    );
  }

  async findAllByStore(storeId: StoreId): Promise<ShoppingList[]> {
    return [...this.map.values()].filter((list) =>
      list.items.some((item) => referencesStore(item, storeId)),
    );
  }

  seed(shoppingList: ShoppingList): void {
    this.map.set(shoppingList.id.value, shoppingList);
  }
}

function referencesStore(item: ShoppingItem, storeId: StoreId): boolean {
  const targetStore = item.targetStore;
  const actualStore = item.actualStore;
  return (
    (targetStore !== null && targetStore.equals(storeId)) ||
    (actualStore !== null && actualStore.equals(storeId))
  );
}

class InMemoryProductRepository implements ProductRepository {
  private readonly map = new Map<string, Product>();
  public readonly findCounts = new Map<string, number>();
  public saveCount = 0;

  constructor(private readonly saveEvents: string[]) {}

  async findById(id: ProductId): Promise<Product | null> {
    this.findCounts.set(id.value, (this.findCounts.get(id.value) ?? 0) + 1);
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Product[]> {
    return [...this.map.values()];
  }

  async save(product: Product): Promise<void> {
    this.saveCount += 1;
    this.saveEvents.push('product');
    this.map.set(product.id.value, product);
  }

  async delete(id: ProductId): Promise<void> {
    this.map.delete(id.value);
  }

  async countPriceRecordsByStore(storeId: StoreId): Promise<number> {
    return [...this.map.values()].reduce(
      (total, product) =>
        total + product.priceHistory.filter((record) => record.storeId.equals(storeId)).length,
      0,
    );
  }

  async deletePriceRecordsByStore(storeId: StoreId): Promise<void> {
    for (const product of this.map.values()) {
      for (const record of product.priceHistory) {
        if (record.storeId.equals(storeId)) {
          product.removePriceRecord(record.id);
        }
      }
    }
  }

  seed(product: Product): void {
    this.map.set(product.id.value, product);
  }
}

class InMemoryPantryRepository implements PantryRepository {
  private pantry = Pantry.create();
  public saveCount = 0;

  constructor(private readonly saveEvents: string[]) {}

  async find(): Promise<Pantry> {
    return this.pantry;
  }

  async save(pantry: Pantry): Promise<void> {
    this.saveCount += 1;
    this.saveEvents.push('pantry');
    this.pantry = pantry;
  }

  seed(stocks: Stock[]): void {
    this.pantry = Pantry.reconstruct({ id: PantryId.singleton(), stocks });
  }
}

class InMemoryMealPlanRepository implements MealPlanRepository {
  private readonly map = new Map<string, MealPlan>();
  public saveCount = 0;

  constructor(private readonly saveEvents: string[]) {}

  async findById(id: MealPlanId): Promise<MealPlan | null> {
    return this.map.get(id.value) ?? null;
  }

  async findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null> {
    return (
      [...this.map.values()].find((mealPlan) => mealPlan.weekOf.equals(weekIdentifier)) ?? null
    );
  }

  async findRecent(limit: number): Promise<MealPlan[]> {
    return [...this.map.values()].slice(0, limit);
  }

  async save(mealPlan: MealPlan): Promise<void> {
    this.saveCount += 1;
    this.saveEvents.push('meal-plan');
    this.map.set(mealPlan.id.value, mealPlan);
  }

  seed(mealPlan: MealPlan): void {
    this.map.set(mealPlan.id.value, mealPlan);
  }
}

interface SeededItemOptions {
  id?: string;
  productId?: string | null;
  displayName?: string;
  requiredAmount?: Quantity | null;
  amountNote?: string | null;
  status?: 'pending' | 'bought' | 'skipped';
  actualPrice?: Money | null;
  actualStoreId?: string | null;
}

function seededItem(options: SeededItemOptions = {}): ShoppingItem {
  const status = options.status ?? 'bought';
  const productId =
    options.productId === undefined
      ? ProductId.fromString(PRODUCT_ID)
      : options.productId === null
        ? null
        : ProductId.fromString(options.productId);
  const requiredAmount =
    options.requiredAmount === undefined ? Quantity.of(2, '個') : options.requiredAmount;
  const actualPrice =
    options.actualPrice === undefined
      ? status === 'bought'
        ? Money.of(200, 'JPY')
        : null
      : options.actualPrice;
  const actualStore =
    options.actualStoreId === undefined
      ? status === 'bought'
        ? StoreId.fromString(STORE_ID)
        : null
      : options.actualStoreId === null
        ? null
        : StoreId.fromString(options.actualStoreId);

  return ShoppingItem.reconstruct({
    id: ShoppingItemId.fromString(options.id ?? SHOPPING_ITEM_ID_1),
    productId,
    displayName: options.displayName ?? '玉ねぎ',
    requiredAmount,
    amountNote:
      options.amountNote === undefined
        ? requiredAmount === null
          ? '適量'
          : null
        : options.amountNote,
    targetStore: StoreId.fromString(STORE_ID),
    status,
    actualPrice,
    actualStore,
    source: 'from_meal_plan',
  });
}

function seededShoppingList(
  items: ShoppingItem[],
  status: ShoppingListStatus = 'active',
): ShoppingList {
  return ShoppingList.reconstruct({
    id: ShoppingListId.fromString(SHOPPING_LIST_ID),
    mealPlanId: MealPlanId.fromString(MEAL_PLAN_ID),
    items,
    shoppingDate: new Date(2026, 6, 11),
    status,
    createdAt: new Date('2026-07-10T12:00:00.000Z'),
  });
}

function seededMealPlan(status: MealPlanStatus): MealPlan {
  return MealPlan.reconstruct({
    id: MealPlanId.fromString(MEAL_PLAN_ID),
    weekOf: WeekIdentifier.fromString('2026-07-11'),
    plannedRecipes: [],
    status,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    completedAt: status === 'completed' ? new Date('2026-07-18T00:00:00.000Z') : null,
  });
}

function seededProduct(priceHistory: PriceRecord[] = []): Product {
  return Product.reconstruct({
    id: ProductId.fromString(PRODUCT_ID),
    name: '玉ねぎ',
    aliases: [],
    category: '野菜',
    defaultUnit: '個',
    priceHistory,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
}

// 前回完了で記録された価格レコード（ID は品目 ID から決定的に導出される）を模す。
function priceRecordForItem(itemId: string): PriceRecord {
  return PriceRecord.reconstruct({
    id: PriceRecordId.fromString(itemId),
    storeId: StoreId.fromString(STORE_ID),
    price: Money.of(200, 'JPY'),
    unitPrice: Money.of(100, 'JPY'),
    packageSize: Quantity.of(2, '個'),
    observedAt: new Date('2026-07-11T09:00:00.000Z'),
  });
}

// 前回完了で在庫化済みの品目を模す（sourceShoppingItemId が冪等マーカー）。
function stockFromItem(itemId: string): Stock {
  return Stock.reconstruct({
    id: StockId.fromString(`stock-for-${itemId}`),
    productId: ProductId.fromString(PRODUCT_ID),
    displayName: '玉ねぎ',
    amount: Quantity.of(2, '個'),
    purchasedAt: new Date('2026-07-11T09:00:00.000Z'),
    expiresAt: null,
    storedLocation: null,
    sourceShoppingItemId: ShoppingItemId.fromString(itemId),
  });
}

function stockAddition(overrides: Partial<StockAdditionInputDto> = {}): StockAdditionInputDto {
  return {
    itemId: SHOPPING_ITEM_ID_1,
    amount: { value: 2, unit: '個' },
    storedLocation: null,
    expiresAt: null,
    ...overrides,
  };
}

let saveEvents: string[];
let shoppingListRepository: InMemoryShoppingListRepository;
let pantryRepository: InMemoryPantryRepository;
let productRepository: InMemoryProductRepository;
let mealPlanRepository: InMemoryMealPlanRepository;

beforeEach(() => {
  saveEvents = [];
  shoppingListRepository = new InMemoryShoppingListRepository(saveEvents);
  pantryRepository = new InMemoryPantryRepository(saveEvents);
  productRepository = new InMemoryProductRepository(saveEvents);
  mealPlanRepository = new InMemoryMealPlanRepository(saveEvents);
});

function completeShoppingUseCase(): CompleteShoppingUseCase {
  return new CompleteShoppingUseCase(
    shoppingListRepository,
    pantryRepository,
    productRepository,
    mealPlanRepository,
  );
}

describe('CompleteShoppingUseCase', () => {
  it('stockAdditions が空なら在庫を追加せず、価格記録と3段の保存順序で完了する', async () => {
    const boughtWithProduct = seededItem();
    const boughtWithoutProduct = seededItem({
      id: SHOPPING_ITEM_ID_2,
      productId: null,
      displayName: '塩',
      requiredAmount: null,
    });
    shoppingListRepository.seed(
      seededShoppingList([
        boughtWithProduct,
        boughtWithoutProduct,
        seededItem({ id: 'pending-item', status: 'pending' }),
        seededItem({ id: 'skipped-item', status: 'skipped' }),
      ]),
    );
    const product = seededProduct();
    const mealPlan = seededMealPlan('shopping');
    productRepository.seed(product);
    mealPlanRepository.seed(mealPlan);

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(result.status).toBe('completed');
    // 価格記録は productId を持つ bought 品目のみ。ID は品目 ID から決定的に導出される。
    expect(product.priceHistory).toHaveLength(1);
    expect(product.priceHistory[0]?.id.value).toBe(SHOPPING_ITEM_ID_1);
    expect(mealPlan.status).toBe('cooking');
    // 在庫化する品目を 1 つも選ばなければ Pantry への保存は発生しない。
    expect(pantryRepository.saveCount).toBe(0);
    expect(saveEvents).toEqual(['product', 'shopping-list', 'meal-plan']);
  });

  it('選択された品目だけを在庫化し、Pantry を先頭とする4段の保存順序で完了する', async () => {
    shoppingListRepository.seed(
      seededShoppingList([
        seededItem(),
        seededItem({ id: SHOPPING_ITEM_ID_2, displayName: '人参' }),
      ]),
    );
    productRepository.seed(seededProduct());
    mealPlanRepository.seed(seededMealPlan('shopping'));

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [stockAddition({ itemId: SHOPPING_ITEM_ID_2 })],
    });

    expect(result.status).toBe('completed');
    const stocks = (await pantryRepository.find()).stocks;
    expect(stocks).toHaveLength(1);
    expect(stocks[0]?.sourceShoppingItemId?.value).toBe(SHOPPING_ITEM_ID_2);
    expect(saveEvents).toEqual(['pantry', 'product', 'shopping-list', 'meal-plan']);
  });

  it('在庫化した Stock に買い物品目と入力値の内容を引き継ぐ', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem({ displayName: 'じゃがいも' })]));
    productRepository.seed(seededProduct());
    mealPlanRepository.seed(seededMealPlan('shopping'));

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [
        stockAddition({
          amount: { value: 500, unit: 'g' },
          storedLocation: 'fridge',
          expiresAt: '2026-08-01',
        }),
      ],
    });

    const stock = (await pantryRepository.find()).stocks[0];
    expect(stock?.displayName).toBe('じゃがいも');
    expect(stock?.productId?.value).toBe(PRODUCT_ID);
    // 数量は買い物リストの requiredAmount（2 個）ではなく、画面で入力された値を使う。
    expect(stock?.amount.value).toBe(500);
    expect(stock?.amount.unit).toBe('g');
    expect(stock?.storedLocation).toBe('fridge');
    // ローカル 0 時で構築され、mapper の toLocalDateString と往復整合する。
    expect(stock?.expiresAt).toEqual(new Date('2026-08-01T00:00:00'));
    expect(stock?.sourceShoppingItemId?.value).toBe(SHOPPING_ITEM_ID_1);
  });

  it('reopen→再 complete でも在庫化済みの品目は二重に在庫追加しない', async () => {
    shoppingListRepository.seed(
      seededShoppingList([seededItem(), seededItem({ id: SHOPPING_ITEM_ID_2 })]),
    );
    productRepository.seed(seededProduct());
    mealPlanRepository.seed(seededMealPlan('shopping'));
    // item1 は前回の完了で在庫化済み。
    pantryRepository.seed([stockFromItem(SHOPPING_ITEM_ID_1)]);

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [
        stockAddition({ itemId: SHOPPING_ITEM_ID_1 }),
        stockAddition({ itemId: SHOPPING_ITEM_ID_2 }),
      ],
    });

    const stocks = (await pantryRepository.find()).stocks;
    expect(stocks).toHaveLength(2);
    expect(stocks.map((stock) => stock.sourceShoppingItemId?.value).sort()).toEqual([
      SHOPPING_ITEM_ID_1,
      SHOPPING_ITEM_ID_2,
    ]);
  });

  it('指定が全て在庫化済みなら Pantry を保存しない', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()]));
    productRepository.seed(seededProduct([priceRecordForItem(SHOPPING_ITEM_ID_1)]));
    mealPlanRepository.seed(seededMealPlan('shopping'));
    pantryRepository.seed([stockFromItem(SHOPPING_ITEM_ID_1)]);

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [stockAddition()],
    });

    expect(pantryRepository.saveCount).toBe(0);
    expect(saveEvents).toEqual(['shopping-list', 'meal-plan']);
  });

  it('同一品目の重複指定は先勝ちで1件だけ在庫化する', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()]));
    productRepository.seed(seededProduct());
    mealPlanRepository.seed(seededMealPlan('shopping'));

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [
        stockAddition({ amount: { value: 3, unit: '個' } }),
        stockAddition({ amount: { value: 9, unit: '個' } }),
      ],
    });

    const stocks = (await pantryRepository.find()).stocks;
    expect(stocks).toHaveLength(1);
    expect(stocks[0]?.amount.value).toBe(3);
  });

  it('在庫化しなかった bought 品目の価格も記録する', async () => {
    shoppingListRepository.seed(
      seededShoppingList([seededItem(), seededItem({ id: SHOPPING_ITEM_ID_2 })]),
    );
    const product = seededProduct();
    productRepository.seed(product);
    mealPlanRepository.seed(seededMealPlan('shopping'));

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [stockAddition({ itemId: SHOPPING_ITEM_ID_1 })],
    });

    // 価格記録は在庫の選択と独立して bought 品目の全件が対象。
    expect(product.priceHistory.map((record) => record.id.value).sort()).toEqual([
      SHOPPING_ITEM_ID_1,
      SHOPPING_ITEM_ID_2,
    ]);
  });

  it('completed のリストへの再実行では stockAdditions を無視する', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()], 'completed'));
    mealPlanRepository.seed(seededMealPlan('cooking'));

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [stockAddition()],
    });

    expect((await pantryRepository.find()).stocks).toHaveLength(0);
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('リストに存在しない itemId の指定は ShoppingItemNotFoundError を投げ、何も保存しない', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()]));
    productRepository.seed(seededProduct());
    mealPlanRepository.seed(seededMealPlan('shopping'));

    await expect(
      completeShoppingUseCase().execute({
        shoppingListId: SHOPPING_LIST_ID,
        stockAdditions: [stockAddition({ itemId: 'missing-item' })],
      }),
    ).rejects.toEqual(new ShoppingItemNotFoundError('missing-item'));
    expect(saveEvents).toEqual([]);
  });

  it.each([
    { status: 'pending' as const, label: 'pending' },
    { status: 'skipped' as const, label: 'skipped' },
  ])(
    '$label 品目の指定は InvalidStockOperationError を投げ、何も保存しない',
    async ({ status }) => {
      shoppingListRepository.seed(seededShoppingList([seededItem({ status })]));
      productRepository.seed(seededProduct());
      mealPlanRepository.seed(seededMealPlan('shopping'));

      await expect(
        completeShoppingUseCase().execute({
          shoppingListId: SHOPPING_LIST_ID,
          stockAdditions: [stockAddition()],
        }),
      ).rejects.toBeInstanceOf(InvalidStockOperationError);
      expect(saveEvents).toEqual([]);
    },
  );

  it('completed の再実行では Product を更新せず同じ DTO を返す', async () => {
    const item = seededItem();
    const shoppingList = seededShoppingList([item], 'completed');
    const expected = toShoppingListDto(shoppingList);
    shoppingListRepository.seed(shoppingList);
    productRepository.seed(seededProduct([priceRecordForItem(SHOPPING_ITEM_ID_1)]));
    mealPlanRepository.seed(seededMealPlan('cooking'));

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(result).toEqual(expected);
    expect(productRepository.findCounts.size).toBe(0);
    expect(productRepository.saveCount).toBe(0);
    expect(shoppingListRepository.saveCount).toBe(0);
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('reopen→再 complete でも既記録の品目は価格を二重記録せず、新規品目のみ記録する', async () => {
    const item1 = seededItem();
    const item2 = seededItem({ id: SHOPPING_ITEM_ID_2 });
    const shoppingList = seededShoppingList([item1, item2]);
    const mealPlan = seededMealPlan('shopping');
    shoppingListRepository.seed(shoppingList);
    // item1 は前回完了で記録済み（決定的 ID = item1.id）。
    const product = seededProduct([priceRecordForItem(SHOPPING_ITEM_ID_1)]);
    productRepository.seed(product);
    mealPlanRepository.seed(mealPlan);

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    // 既記録の item1 はスキップ、新規 item2 のみ追加 → 合計 2 件（重複なし）。
    expect(product.priceHistory).toHaveLength(2);
    expect(product.priceHistory.map((record) => record.id.value).sort()).toEqual([
      SHOPPING_ITEM_ID_1,
      SHOPPING_ITEM_ID_2,
    ]);
    expect(productRepository.saveCount).toBe(1);
    expect(shoppingList.status).toBe('completed');
    expect(mealPlan.status).toBe('cooking');
    expect(mealPlanRepository.saveCount).toBe(1);
  });

  it.each([
    { initialStatus: 'shopping' as const, label: 'shopping から一段遷移' },
    { initialStatus: 'draft' as const, label: 'draft から二段遷移' },
  ])('completed 後の再実行で MealPlan を $labelして修復する', async ({ initialStatus }) => {
    shoppingListRepository.seed(seededShoppingList([seededItem()], 'completed'));
    const mealPlan = seededMealPlan(initialStatus);
    mealPlanRepository.seed(mealPlan);

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(result.status).toBe('completed');
    expect(mealPlan.status).toBe('cooking');
    expect(mealPlanRepository.saveCount).toBe(1);
    expect(productRepository.saveCount).toBe(0);
  });

  it('bought 品目が0件でも完了と MealPlan 遷移を実行する', async () => {
    shoppingListRepository.seed(
      seededShoppingList([
        seededItem({ status: 'pending' }),
        seededItem({ id: SHOPPING_ITEM_ID_2, status: 'skipped' }),
      ]),
    );
    const mealPlan = seededMealPlan('shopping');
    mealPlanRepository.seed(mealPlan);

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(result.status).toBe('completed');
    expect(productRepository.findCounts.size).toBe(0);
    expect(productRepository.saveCount).toBe(0);
    expect(mealPlan.status).toBe('cooking');
  });

  it.each([
    {
      label: 'productId が null',
      options: { productId: null } satisfies SeededItemOptions,
      seedProduct: false,
    },
    {
      label: 'actualPrice が 0',
      options: { actualPrice: Money.of(0, 'JPY') } satisfies SeededItemOptions,
      seedProduct: true,
    },
    {
      label: 'actualPrice が null（チェックのみで金額未記録）',
      options: { actualPrice: null } satisfies SeededItemOptions,
      seedProduct: true,
    },
    {
      label: 'requiredAmount が null',
      options: { requiredAmount: null } satisfies SeededItemOptions,
      seedProduct: true,
    },
    {
      label: 'requiredAmount が 0',
      options: { requiredAmount: Quantity.of(0, 'g') } satisfies SeededItemOptions,
      seedProduct: true,
    },
    {
      label: 'unitPrice が丸めで 0',
      options: {
        actualPrice: Money.of(1, 'JPY'),
        requiredAmount: Quantity.of(10000, '個'),
      } satisfies SeededItemOptions,
      seedProduct: true,
    },
    {
      label: 'Product が削除済み',
      options: {} satisfies SeededItemOptions,
      seedProduct: false,
    },
  ])(
    '$label の品目は価格記録をスキップし Product を保存しない',
    async ({ options, seedProduct }) => {
      const item = seededItem(options);
      shoppingListRepository.seed(seededShoppingList([item]));
      mealPlanRepository.seed(seededMealPlan('shopping'));
      const product = seededProduct();
      if (seedProduct) {
        productRepository.seed(product);
      }

      const result = await completeShoppingUseCase().execute({
        shoppingListId: SHOPPING_LIST_ID,
        stockAdditions: [],
      });

      expect(result.status).toBe('completed');
      expect(product.priceHistory).toHaveLength(0);
      // 記録が 1 件も発生しない Product は保存しない（changed ガード）。
      expect(productRepository.saveCount).toBe(0);
    },
  );

  it('同一 Product の複数品目を1回の取得・保存で価格履歴へ追加する', async () => {
    shoppingListRepository.seed(
      seededShoppingList([
        seededItem(),
        seededItem({ id: SHOPPING_ITEM_ID_2, actualPrice: Money.of(300, 'JPY') }),
      ]),
    );
    const product = seededProduct();
    productRepository.seed(product);
    mealPlanRepository.seed(seededMealPlan('shopping'));

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(productRepository.findCounts.get(PRODUCT_ID)).toBe(1);
    expect(productRepository.saveCount).toBe(1);
    expect(product.priceHistory).toHaveLength(2);
  });

  it('対応する MealPlan が存在しなくても買い物完了を成功させる', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem({ productId: null })]));

    const result = await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(result.status).toBe('completed');
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('修復対象外の MealPlan 状態では遷移・保存を行わない', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()], 'completed'));
    const mealPlan = seededMealPlan('consuming');
    mealPlanRepository.seed(mealPlan);

    await completeShoppingUseCase().execute({
      shoppingListId: SHOPPING_LIST_ID,
      stockAdditions: [],
    });

    expect(mealPlan.status).toBe('consuming');
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('ShoppingList が存在しない場合は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      completeShoppingUseCase().execute({ shoppingListId: 'missing-list', stockAdditions: [] }),
    ).rejects.toEqual(new ShoppingListNotFoundError('missing-list'));
    expect(productRepository.findCounts.size).toBe(0);
  });
});
