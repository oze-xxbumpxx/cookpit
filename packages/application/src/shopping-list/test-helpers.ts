/**
 * ShoppingList 系 UseCase テストの共有フィクスチャ。
 * UseCase ごとに分割したテストファイル（`*.use-case.test.ts`）から利用する。
 */
import {
  MealPlan,
  MealPlanId,
  Money,
  Pantry,
  PlannedRecipe,
  PlannedRecipeId,
  PriceRecord,
  PriceRecordId,
  Product,
  ProductId,
  Quantity,
  Recipe,
  RecipeId,
  RecipeIngredient,
  ShoppingItem,
  ShoppingItemId,
  ShoppingList,
  ShoppingListId,
  StoreId,
  WeekIdentifier,
} from '@cookpit/domain';
import type {
  CreateStockInput,
  MealPlanRepository,
  MealPlanStatus,
  PantryRepository,
  ProductRepository,
  RecipeRepository,
  ShoppingListRepository,
  Unit,
} from '@cookpit/domain';

export const MEAL_PLAN_ID = 'meal-plan-1';
export const SHOPPING_LIST_ID = 'shopping-list-1';
export const SHOPPING_ITEM_ID = 'shopping-item-1';
export const RECIPE_ID = 'recipe-1';
export const PRODUCT_ID = 'product-1';
export const STORE_ID = 'store-1';

export class InMemoryMealPlanRepository implements MealPlanRepository {
  private readonly map = new Map<string, MealPlan>();
  public saveCount = 0;

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
    this.map.set(mealPlan.id.value, mealPlan);
  }

  seed(mealPlan: MealPlan): void {
    this.map.set(mealPlan.id.value, mealPlan);
  }
}

export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly map = new Map<string, Recipe>();

  async findById(id: RecipeId): Promise<Recipe | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Recipe[]> {
    return [...this.map.values()];
  }

  async save(recipe: Recipe): Promise<void> {
    this.map.set(recipe.id.value, recipe);
  }

  async delete(id: RecipeId): Promise<void> {
    this.map.delete(id.value);
  }

  seed(recipe: Recipe): void {
    this.map.set(recipe.id.value, recipe);
  }
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly map = new Map<string, Product>();

  async findById(id: ProductId): Promise<Product | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Product[]> {
    return [...this.map.values()];
  }

  async save(product: Product): Promise<void> {
    this.map.set(product.id.value, product);
  }

  async delete(id: ProductId): Promise<void> {
    this.map.delete(id.value);
  }

  seed(product: Product): void {
    this.map.set(product.id.value, product);
  }
}

export class InMemoryShoppingListRepository implements ShoppingListRepository {
  private readonly map = new Map<string, ShoppingList>();
  public saveCount = 0;

  async findById(id: ShoppingListId): Promise<ShoppingList | null> {
    return this.map.get(id.value) ?? null;
  }

  async findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null> {
    return [...this.map.values()].find((list) => list.mealPlanId.equals(mealPlanId)) ?? null;
  }

  async save(shoppingList: ShoppingList): Promise<void> {
    this.saveCount += 1;
    this.map.set(shoppingList.id.value, shoppingList);
  }

  seed(shoppingList: ShoppingList): void {
    this.map.set(shoppingList.id.value, shoppingList);
  }
}

export class InMemoryPantryRepository implements PantryRepository {
  private pantry: Pantry = Pantry.create();
  public saveCount = 0;

  async find(): Promise<Pantry> {
    return this.pantry;
  }

  async save(pantry: Pantry): Promise<void> {
    this.saveCount += 1;
    this.pantry = pantry;
  }

  seedStock(input: CreateStockInput): void {
    this.pantry.addStock(input);
  }

  current(): Pantry {
    return this.pantry;
  }
}

export function stockInput(
  productId: string | null,
  value: number,
  unit: Unit,
  options: { displayName?: string; expiresAt?: Date | null; purchasedAt?: Date } = {},
): CreateStockInput {
  return {
    productId: productId === null ? null : ProductId.fromString(productId),
    displayName: options.displayName ?? '玉ねぎ',
    amount: Quantity.of(value, unit),
    purchasedAt: options.purchasedAt ?? new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: options.expiresAt ?? null,
    storedLocation: null,
    sourceShoppingItemId: null,
  };
}

export function seededPlannedRecipe(id: string, recipeId: string, scaleFactor = 1): PlannedRecipe {
  return PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString(id),
    recipeId: RecipeId.fromString(recipeId),
    scaleFactor,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
  });
}

export function seededMealPlan(
  status: MealPlanStatus = 'draft',
  plannedRecipes: PlannedRecipe[] = [],
): MealPlan {
  return MealPlan.reconstruct({
    id: MealPlanId.fromString(MEAL_PLAN_ID),
    weekOf: WeekIdentifier.fromString('2026-07-11'),
    plannedRecipes,
    status,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    completedAt: status === 'completed' ? new Date('2026-07-18T00:00:00.000Z') : null,
  });
}

export function seededRecipe(id: string, ingredients: RecipeIngredient[]): Recipe {
  return Recipe.reconstruct({
    id: RecipeId.fromString(id),
    name: `Recipe ${id}`,
    ingredients,
    steps: [],
    baseServings: 2,
    tags: [],
    cookingTime: null,
    notes: '',
    servings: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
}

export function amountIngredient(
  displayName: string,
  value: number,
  unit: 'g' | 'kg' | '個',
  productId: string | null = null,
): RecipeIngredient {
  return RecipeIngredient.create({
    productRef: productId === null ? null : ProductId.fromString(productId),
    displayName,
    amount: Quantity.of(value, unit),
    amountNote: null,
  });
}

export function noteIngredient(displayName: string, amountNote: string): RecipeIngredient {
  return RecipeIngredient.create({
    productRef: null,
    displayName,
    amount: null,
    amountNote,
  });
}

export function seededProduct(id: string, withPrice = true): Product {
  const priceHistory = withPrice
    ? [
        PriceRecord.reconstruct({
          id: PriceRecordId.fromString('price-record-1'),
          storeId: StoreId.fromString(STORE_ID),
          price: Money.of(200, 'JPY'),
          unitPrice: Money.of(100, 'JPY'),
          packageSize: Quantity.of(2, '個'),
          observedAt: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ]
    : [];
  return Product.reconstruct({
    id: ProductId.fromString(id),
    name: '玉ねぎ',
    aliases: [],
    category: '野菜',
    defaultUnit: '個',
    priceHistory,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
}

export interface SeededItemOptions {
  id?: string;
  status?: 'pending' | 'bought' | 'skipped';
  targetStoreId?: string | null;
  actualPrice?: Money | null;
  actualStoreId?: string | null;
}

export function seededItem(options: SeededItemOptions = {}): ShoppingItem {
  return ShoppingItem.reconstruct({
    id: ShoppingItemId.fromString(options.id ?? SHOPPING_ITEM_ID),
    productId: ProductId.fromString(PRODUCT_ID),
    displayName: '玉ねぎ',
    requiredAmount: Quantity.of(2, '個'),
    amountNote: null,
    targetStore:
      options.targetStoreId === null ? null : StoreId.fromString(options.targetStoreId ?? STORE_ID),
    status: options.status ?? 'pending',
    actualPrice: options.actualPrice ?? null,
    actualStore:
      options.actualStoreId === null
        ? null
        : options.actualStoreId === undefined
          ? null
          : StoreId.fromString(options.actualStoreId),
    source: 'from_meal_plan',
  });
}

export function seededShoppingList(
  status: 'active' | 'completed' = 'active',
  items: ShoppingItem[] = [seededItem()],
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

export interface TestRepositories {
  mealPlanRepository: InMemoryMealPlanRepository;
  recipeRepository: InMemoryRecipeRepository;
  productRepository: InMemoryProductRepository;
  shoppingListRepository: InMemoryShoppingListRepository;
  pantryRepository: InMemoryPantryRepository;
}

/** テストごとに空の InMemory リポジトリ一式を作る。 */
export function createRepositories(): TestRepositories {
  return {
    mealPlanRepository: new InMemoryMealPlanRepository(),
    recipeRepository: new InMemoryRecipeRepository(),
    productRepository: new InMemoryProductRepository(),
    shoppingListRepository: new InMemoryShoppingListRepository(),
    pantryRepository: new InMemoryPantryRepository(),
  };
}
