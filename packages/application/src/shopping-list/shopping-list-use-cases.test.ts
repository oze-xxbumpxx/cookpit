import {
  MealPlan,
  type MealPlanStatus,
  PlannedRecipe,
} from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { PlannedRecipeId } from '@cookpit/domain/src/meal-plan/planned-recipe-id';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { PriceRecord, Product } from '@cookpit/domain/src/product/product';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { RecipeIngredient } from '@cookpit/domain/src/recipe/recipe-ingredient';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { Money } from '@cookpit/domain/src/shared/money';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { StoreId } from '@cookpit/domain/src/shared/store';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingItem, ShoppingList } from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidMealPlanStateError } from '../meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../meal-plan/meal-plan-not-found.error';
import { AddItemUseCase } from './add-item.use-case';
import { GenerateShoppingListUseCase } from './generate-shopping-list.use-case';
import { GetShoppingListUseCase } from './get-shopping-list.use-case';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import { MarkAsBoughtUseCase } from './mark-as-bought.use-case';
import { ReassignStoreUseCase } from './reassign-store.use-case';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

const MEAL_PLAN_ID = 'meal-plan-1';
const SHOPPING_LIST_ID = 'shopping-list-1';
const SHOPPING_ITEM_ID = 'shopping-item-1';
const RECIPE_ID = 'recipe-1';
const PRODUCT_ID = 'product-1';
const STORE_ID = 'store-1';

class InMemoryMealPlanRepository implements MealPlanRepository {
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

class InMemoryRecipeRepository implements RecipeRepository {
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

class InMemoryProductRepository implements ProductRepository {
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

class InMemoryShoppingListRepository implements ShoppingListRepository {
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

function seededPlannedRecipe(id: string, recipeId: string, scaleFactor = 1): PlannedRecipe {
  return PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString(id),
    recipeId: RecipeId.fromString(recipeId),
    scaleFactor,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
  });
}

function seededMealPlan(
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

function seededRecipe(id: string, ingredients: RecipeIngredient[]): Recipe {
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

function amountIngredient(
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

function noteIngredient(displayName: string, amountNote: string): RecipeIngredient {
  return RecipeIngredient.create({
    productRef: null,
    displayName,
    amount: null,
    amountNote,
  });
}

function seededProduct(id: string, withPrice = true): Product {
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

interface SeededItemOptions {
  id?: string;
  status?: 'pending' | 'bought' | 'skipped';
  targetStoreId?: string | null;
  actualPrice?: Money | null;
  actualStoreId?: string | null;
}

function seededItem(options: SeededItemOptions = {}): ShoppingItem {
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

function seededShoppingList(
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

let mealPlanRepository: InMemoryMealPlanRepository;
let recipeRepository: InMemoryRecipeRepository;
let productRepository: InMemoryProductRepository;
let shoppingListRepository: InMemoryShoppingListRepository;

beforeEach(() => {
  mealPlanRepository = new InMemoryMealPlanRepository();
  recipeRepository = new InMemoryRecipeRepository();
  productRepository = new InMemoryProductRepository();
  shoppingListRepository = new InMemoryShoppingListRepository();
});

function generateUseCase(): GenerateShoppingListUseCase {
  return new GenerateShoppingListUseCase(
    mealPlanRepository,
    recipeRepository,
    productRepository,
    shoppingListRepository,
  );
}

describe('GenerateShoppingListUseCase', () => {
  it('複数レシピの材料を合算し、最安店舗つきの ShoppingListDto を生成する', async () => {
    mealPlanRepository.seed(
      seededMealPlan('draft', [
        seededPlannedRecipe('planned-1', RECIPE_ID),
        seededPlannedRecipe('planned-2', 'recipe-2'),
      ]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    recipeRepository.seed(
      seededRecipe('recipe-2', [amountIngredient('タマネギ', 1, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.created).toBe(true);
    expect(result.shoppingList.shoppingDate).toBe('2026-07-11');
    expect(result.shoppingList.items).toHaveLength(1);
    expect(result.shoppingList.items[0]).toMatchObject({
      displayName: '玉ねぎ',
      requiredAmount: { value: 3, unit: '個' },
      targetStoreId: STORE_ID,
      source: 'from_meal_plan',
    });
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(mealPlanRepository.saveCount).toBe(1);
  });

  it('存在しない MealPlan は MealPlanNotFoundError を投げる', async () => {
    await expect(generateUseCase().execute({ mealPlanId: 'missing' })).rejects.toBeInstanceOf(
      MealPlanNotFoundError,
    );
  });

  it('既存リストがない draft 以外の MealPlan は InvalidMealPlanStateError を投げる', async () => {
    mealPlanRepository.seed(seededMealPlan('cooking'));

    await expect(generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID })).rejects.toBeInstanceOf(
      InvalidMealPlanStateError,
    );
  });

  it('冪等再実行では既存リストを返し保存回数を増やさない', async () => {
    mealPlanRepository.seed(seededMealPlan());
    const useCase = generateUseCase();

    const first = await useCase.execute({ mealPlanId: MEAL_PLAN_ID });
    const second = await useCase.execute({ mealPlanId: MEAL_PLAN_ID });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.shoppingList.id).toBe(first.shoppingList.id);
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(mealPlanRepository.saveCount).toBe(1);
  });

  it('既存リストがあり MealPlan が draft の部分失敗状態を shopping へ自己修復する', async () => {
    const mealPlan = seededMealPlan();
    mealPlanRepository.seed(mealPlan);
    shoppingListRepository.seed(seededShoppingList());

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.created).toBe(false);
    expect(mealPlan.status).toBe('shopping');
    expect(mealPlanRepository.saveCount).toBe(1);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('既存リストがあり MealPlan が cooking なら遷移せず既存を返す', async () => {
    const mealPlan = seededMealPlan('cooking');
    mealPlanRepository.seed(mealPlan);
    shoppingListRepository.seed(seededShoppingList());

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.created).toBe(false);
    expect(mealPlan.status).toBe('cooking');
    expect(mealPlanRepository.saveCount).toBe(0);
  });

  it('削除済み Recipe をスキップし、存在する Recipe の材料だけを生成する', async () => {
    mealPlanRepository.seed(
      seededMealPlan('draft', [
        seededPlannedRecipe('planned-1', 'deleted-recipe'),
        seededPlannedRecipe('planned-2', RECIPE_ID),
      ]),
    );
    recipeRepository.seed(seededRecipe(RECIPE_ID, [amountIngredient('塩', 10, 'g')]));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(1);
    expect(result.shoppingList.items[0]?.displayName).toBe('塩');
  });

  it('plannedRecipes が空でも items が空のリストを生成する', async () => {
    mealPlanRepository.seed(seededMealPlan());

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toEqual([]);
  });

  it('集計キーの単位境界、適量の個別行、小数 scaleFactor を保持する', async () => {
    mealPlanRepository.seed(
      seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID, 1.5)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [
        amountIngredient('小麦粉', 100, 'g'),
        amountIngredient('小麦粉', 0.1, 'kg'),
        noteIngredient('塩', '少々'),
        noteIngredient('塩', '適量'),
      ]),
    );

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(4);
    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 150, unit: 'g' });
    expect(result.shoppingList.items[1]?.requiredAmount).toEqual({
      value: 0.15000000000000002,
      unit: 'kg',
    });
    expect(result.shoppingList.items.slice(2).map((item) => item.amountNote)).toEqual([
      '少々',
      '適量',
    ]);
  });

  it('productId なし、価格履歴なしでは targetStoreId を null にする', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [
        amountIngredient('塩', 10, 'g'),
        amountIngredient('玉ねぎ', 1, '個', PRODUCT_ID),
      ]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID, false));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items.map((item) => item.targetStoreId)).toEqual([null, null]);
  });
});

describe('AddItemUseCase', () => {
  it('productId と targetStoreId つきの手動アイテムを追加する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    const dto = await new AddItemUseCase(shoppingListRepository).execute({
      shoppingListId: SHOPPING_LIST_ID,
      displayName: '牛乳',
      requiredAmount: { value: 1, unit: '本' },
      productId: PRODUCT_ID,
      targetStoreId: STORE_ID,
    });

    expect(dto).toMatchObject({
      productId: PRODUCT_ID,
      targetStoreId: STORE_ID,
      source: 'manually_added',
      status: 'pending',
    });
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('productId と targetStoreId を省略すると null で追加する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    const dto = await new AddItemUseCase(shoppingListRepository).execute({
      shoppingListId: SHOPPING_LIST_ID,
      displayName: '牛乳',
      requiredAmount: { value: 1, unit: '本' },
    });

    expect(dto.productId).toBeNull();
    expect(dto.targetStoreId).toBeNull();
  });

  it.each([
    { productId: PRODUCT_ID, targetStoreId: null },
    { productId: null, targetStoreId: STORE_ID },
  ])(
    'productId=$productId と targetStoreId=$targetStoreId の組み合わせを保持する',
    async ({ productId, targetStoreId }) => {
      shoppingListRepository.seed(seededShoppingList('active', []));

      const dto = await new AddItemUseCase(shoppingListRepository).execute({
        shoppingListId: SHOPPING_LIST_ID,
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
        productId,
        targetStoreId,
      });

      expect(dto.productId).toBe(productId);
      expect(dto.targetStoreId).toBe(targetStoreId);
    },
  );

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new AddItemUseCase(shoppingListRepository).execute({
        shoppingListId: 'missing',
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
      }),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new AddItemUseCase(shoppingListRepository).execute({
        shoppingListId: SHOPPING_LIST_ID,
        displayName: '牛乳',
        requiredAmount: { value: 1, unit: '本' },
      }),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });
});

describe('MarkAsBoughtUseCase', () => {
  const input = {
    shoppingListId: SHOPPING_LIST_ID,
    itemId: SHOPPING_ITEM_ID,
    actualPrice: { amount: 180, currency: 'JPY' },
    actualStoreId: 'actual-store-1',
  };

  it('アイテムを購入済みにして実績を記録する', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new MarkAsBoughtUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toEqual({ amount: 180, currency: 'JPY' });
    expect(dto.actualStoreId).toBe('actual-store-1');
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new MarkAsBoughtUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });

  it('bought への再適用は最新の購入実績で上書きする', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(100, 'JPY'),
          actualStoreId: 'old-store',
        }),
      ]),
    );

    const dto = await new MarkAsBoughtUseCase(shoppingListRepository).execute(input);

    expect(dto.actualPrice?.amount).toBe(180);
    expect(dto.actualStoreId).toBe('actual-store-1');
  });

  it('skipped からも bought へ更新できる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'skipped' })]));

    const dto = await new MarkAsBoughtUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
  });
});

describe('ReassignStoreUseCase', () => {
  const input = {
    shoppingListId: SHOPPING_LIST_ID,
    itemId: SHOPPING_ITEM_ID,
    targetStoreId: 'new-store',
  };

  it('購入予定店舗を変更する', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new ReassignStoreUseCase(shoppingListRepository).execute(input);

    expect(dto.targetStoreId).toBe('new-store');
  });

  it('bought の購入実績を保持したまま targetStoreId だけ変更する', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(100, 'JPY'),
          actualStoreId: 'actual-store',
        }),
      ]),
    );

    const dto = await new ReassignStoreUseCase(shoppingListRepository).execute(input);

    expect(dto.targetStoreId).toBe('new-store');
    expect(dto.actualPrice).toEqual({ amount: 100, currency: 'JPY' });
    expect(dto.actualStoreId).toBe('actual-store');
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new ReassignStoreUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });
});

describe('GetShoppingListUseCase', () => {
  it('ShoppingListDto をローカル日付で返す', async () => {
    shoppingListRepository.seed(seededShoppingList());

    const dto = await new GetShoppingListUseCase(shoppingListRepository).execute({
      shoppingListId: SHOPPING_LIST_ID,
    });

    expect(dto.id).toBe(SHOPPING_LIST_ID);
    expect(dto.shoppingDate).toBe('2026-07-11');
    expect(dto.items).toHaveLength(1);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new GetShoppingListUseCase(shoppingListRepository).execute({
        shoppingListId: 'missing',
      }),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });
});
