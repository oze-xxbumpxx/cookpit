import { MealPlan, type MealPlanStatus } from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { Pantry, Stock } from '@cookpit/domain/src/pantry/pantry';
import { PantryId } from '@cookpit/domain/src/pantry/pantry-id';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { PriceRecord, Product } from '@cookpit/domain/src/product/product';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import {
  ShoppingItem,
  ShoppingList,
  type ShoppingListStatus,
} from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { beforeEach, describe, expect, it } from 'vitest';
import { CompleteShoppingUseCase } from './complete-shopping.use-case';
import { toShoppingListDto } from './shopping-list.mapper';
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

  seed(shoppingList: ShoppingList): void {
    this.map.set(shoppingList.id.value, shoppingList);
  }
}

class InMemoryPantryRepository implements PantryRepository {
  private pantry = Pantry.create();
  public findCount = 0;
  public saveCount = 0;

  constructor(private readonly saveEvents: string[]) {}

  async find(): Promise<Pantry> {
    this.findCount += 1;
    return this.pantry;
  }

  async save(pantry: Pantry): Promise<void> {
    this.saveCount += 1;
    this.saveEvents.push('pantry');
    this.pantry = pantry;
  }

  seed(pantry: Pantry): void {
    this.pantry = pantry;
  }
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

  seed(product: Product): void {
    this.map.set(product.id.value, product);
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

function seededPriceRecord(): PriceRecord {
  return PriceRecord.reconstruct({
    id: PriceRecordId.fromString('price-record-1'),
    storeId: StoreId.fromString(STORE_ID),
    price: Money.of(200, 'JPY'),
    unitPrice: Money.of(100, 'JPY'),
    packageSize: Quantity.of(2, '個'),
    observedAt: new Date('2026-07-11T09:00:00.000Z'),
  });
}

function seededStockFromItem(item: ShoppingItem): Stock {
  return Stock.reconstruct({
    id: StockId.fromString(`stock-${item.id.value}`),
    productId: item.productId,
    displayName: item.displayName,
    amount: item.requiredAmount ?? Quantity.of(1, '個'),
    purchasedAt: new Date('2026-07-11T09:00:00.000Z'),
    expiresAt: null,
    storedLocation: null,
    sourceShoppingItemId: item.id,
  });
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
  it('bought 品目だけを在庫・価格履歴へ反映し、4段の保存順序で完了する', async () => {
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

    const result = await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });
    const pantry = await pantryRepository.find();

    expect(result.status).toBe('completed');
    expect(pantry.stocks).toHaveLength(2);
    expect(pantry.stocks.map((stock) => stock.sourceShoppingItemId?.value)).toEqual([
      SHOPPING_ITEM_ID_1,
      SHOPPING_ITEM_ID_2,
    ]);
    expect(pantry.stocks[1]).toMatchObject({
      productId: null,
      displayName: '塩',
      expiresAt: null,
      storedLocation: null,
    });
    expect(pantry.stocks[1]?.amount).toMatchObject({ value: 1, unit: '個' });
    expect(product.priceHistory).toHaveLength(1);
    expect(product.priceHistory[0]?.observedAt.toISOString()).toBe(
      pantry.stocks[0]?.purchasedAt.toISOString(),
    );
    expect(mealPlan.status).toBe('cooking');
    expect(saveEvents).toEqual(['pantry', 'product', 'shopping-list', 'meal-plan']);
  });

  it('completed の再実行では Pantry と Product を更新せず同じ DTO を返す', async () => {
    const item = seededItem();
    const shoppingList = seededShoppingList([item], 'completed');
    const expected = toShoppingListDto(shoppingList);
    shoppingListRepository.seed(shoppingList);
    pantryRepository.seed(
      Pantry.reconstruct({
        id: PantryId.singleton(),
        stocks: [seededStockFromItem(item)],
      }),
    );
    productRepository.seed(seededProduct([seededPriceRecord()]));
    mealPlanRepository.seed(seededMealPlan('cooking'));

    const result = await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(result).toEqual(expected);
    expect(pantryRepository.findCount).toBe(0);
    expect(pantryRepository.saveCount).toBe(0);
    expect(productRepository.findCounts.size).toBe(0);
    expect(productRepository.saveCount).toBe(0);
    expect(shoppingListRepository.saveCount).toBe(0);
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('既に在庫化済みの品目は Stock も価格記録も重複させず、新規品目のみ処理する', async () => {
    const item1 = seededItem();
    const item2 = seededItem({ id: SHOPPING_ITEM_ID_2 });
    const shoppingList = seededShoppingList([item1, item2]);
    const mealPlan = seededMealPlan('shopping');
    shoppingListRepository.seed(shoppingList);
    pantryRepository.seed(
      Pantry.reconstruct({
        id: PantryId.singleton(),
        stocks: [seededStockFromItem(item1)],
      }),
    );
    const product = seededProduct();
    productRepository.seed(product);
    mealPlanRepository.seed(mealPlan);

    await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });
    const pantry = await pantryRepository.find();

    expect(pantry.stocks).toHaveLength(2);
    expect(
      pantry.stocks.filter((stock) => stock.sourceShoppingItemId?.value === SHOPPING_ITEM_ID_1),
    ).toHaveLength(1);
    expect(productRepository.saveCount).toBe(1);
    // 既に在庫化済みの item1 は価格記録もスキップし、新規 item2 の 1 件のみ記録する
    // （reopen→再 complete での二重記録を防ぐ冪等化）。
    expect(product.priceHistory).toHaveLength(1);
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

    const result = await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(result.status).toBe('completed');
    expect(mealPlan.status).toBe('cooking');
    expect(mealPlanRepository.saveCount).toBe(1);
    expect(pantryRepository.saveCount).toBe(0);
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

    const result = await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });
    const pantry = await pantryRepository.find();

    expect(result.status).toBe('completed');
    expect(pantry.stocks).toEqual([]);
    expect(productRepository.findCounts.size).toBe(0);
    expect(productRepository.saveCount).toBe(0);
    expect(mealPlan.status).toBe('cooking');
  });

  it.each([
    {
      label: 'productId が null',
      options: { productId: null } satisfies SeededItemOptions,
      seedProduct: false,
      expectedAmount: { value: 2, unit: '個' },
    },
    {
      label: 'actualPrice が 0',
      options: { actualPrice: Money.of(0, 'JPY') } satisfies SeededItemOptions,
      seedProduct: true,
      expectedAmount: { value: 2, unit: '個' },
    },
    {
      label: 'requiredAmount が null',
      options: { requiredAmount: null } satisfies SeededItemOptions,
      seedProduct: true,
      expectedAmount: { value: 1, unit: '個' },
    },
    {
      label: 'requiredAmount が 0',
      options: { requiredAmount: Quantity.of(0, 'g') } satisfies SeededItemOptions,
      seedProduct: true,
      expectedAmount: { value: 1, unit: '個' },
    },
    {
      label: 'unitPrice が丸めで 0',
      options: {
        actualPrice: Money.of(1, 'JPY'),
        requiredAmount: Quantity.of(10000, '個'),
      } satisfies SeededItemOptions,
      seedProduct: true,
      expectedAmount: { value: 10000, unit: '個' },
    },
    {
      label: 'Product が削除済み',
      options: {} satisfies SeededItemOptions,
      seedProduct: false,
      expectedAmount: { value: 2, unit: '個' },
    },
  ])(
    '$label の品目は Stock を追加しつつ価格記録をスキップする',
    async ({ options, seedProduct, expectedAmount }) => {
      const item = seededItem(options);
      shoppingListRepository.seed(seededShoppingList([item]));
      mealPlanRepository.seed(seededMealPlan('shopping'));
      const product = seededProduct();
      if (seedProduct) {
        productRepository.seed(product);
      }

      const result = await completeShoppingUseCase().execute({
        shoppingListId: SHOPPING_LIST_ID,
      });
      const pantry = await pantryRepository.find();

      expect(result.status).toBe('completed');
      expect(pantry.stocks).toHaveLength(1);
      expect(pantry.stocks[0]?.amount).toMatchObject(expectedAmount);
      expect(product.priceHistory).toHaveLength(0);
      expect(productRepository.saveCount).toBe(seedProduct ? 1 : 0);
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

    await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(productRepository.findCounts.get(PRODUCT_ID)).toBe(1);
    expect(productRepository.saveCount).toBe(1);
    expect(product.priceHistory).toHaveLength(2);
  });

  it('対応する MealPlan が存在しなくても買い物完了を成功させる', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem({ productId: null })]));

    const result = await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(result.status).toBe('completed');
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('修復対象外の MealPlan 状態では遷移・保存を行わない', async () => {
    shoppingListRepository.seed(seededShoppingList([seededItem()], 'completed'));
    const mealPlan = seededMealPlan('consuming');
    mealPlanRepository.seed(mealPlan);

    await completeShoppingUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(mealPlan.status).toBe('consuming');
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('ShoppingList が存在しない場合は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      completeShoppingUseCase().execute({ shoppingListId: 'missing-list' }),
    ).rejects.toEqual(new ShoppingListNotFoundError('missing-list'));
    expect(pantryRepository.findCount).toBe(0);
    expect(productRepository.findCounts.size).toBe(0);
  });
});
