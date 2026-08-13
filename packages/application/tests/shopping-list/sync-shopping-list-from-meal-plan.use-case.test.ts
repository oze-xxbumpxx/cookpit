import { beforeEach, describe, expect, it } from 'vitest';
import { Quantity } from '@cookpit/domain';
import { InvalidMealPlanStateError } from '../../src/meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../../src/meal-plan/meal-plan-not-found.error';
import { InvalidShoppingListStateError } from '../../src/shopping-list/invalid-shopping-list-state.error';
import { ShoppingListNotFoundError } from '../../src/shopping-list/shopping-list-not-found.error';
import { SyncShoppingListFromMealPlanUseCase } from '../../src/shopping-list/sync-shopping-list-from-meal-plan.use-case';
import {
  SHOPPING_LIST_ID,
  RECIPE_ID,
  PRODUCT_ID,
  MEAL_PLAN_ID,
  stockInput,
  seededPlannedRecipe,
  seededMealPlan,
  seededRecipe,
  amountIngredient,
  seededProduct,
  seededItem,
  seededShoppingList,
  createRepositories,
} from './test-helpers';
import type {
  InMemoryMealPlanRepository,
  InMemoryPantryRepository,
  InMemoryProductRepository,
  InMemoryRecipeRepository,
  InMemoryShoppingListRepository,
} from './test-helpers';

let mealPlanRepository: InMemoryMealPlanRepository;
let recipeRepository: InMemoryRecipeRepository;
let productRepository: InMemoryProductRepository;
let shoppingListRepository: InMemoryShoppingListRepository;
let pantryRepository: InMemoryPantryRepository;

beforeEach(() => {
  ({
    mealPlanRepository,
    recipeRepository,
    productRepository,
    shoppingListRepository,
    pantryRepository,
  } = createRepositories());
});

function syncUseCase(): SyncShoppingListFromMealPlanUseCase {
  return new SyncShoppingListFromMealPlanUseCase(
    shoppingListRepository,
    mealPlanRepository,
    recipeRepository,
    productRepository,
    pantryRepository,
  );
}

describe('SyncShoppingListFromMealPlanUseCase', () => {
  it('新規レシピの材料だけを追加し、既存品目（チェック状態）は変更しない', async () => {
    // 既存リスト: 玉ねぎ(product-1) を bought 済み
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'bought' })]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [
        seededPlannedRecipe('planned-1', RECIPE_ID),
        seededPlannedRecipe('planned-2', 'recipe-2'),
      ]),
    );
    // recipe-1 の玉ねぎは既存キーと一致（追加しない）、recipe-2 の人参は新規
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    recipeRepository.seed(
      seededRecipe('recipe-2', [amountIngredient('人参', 3, '個', 'product-2')]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));
    productRepository.seed(seededProduct('product-2'));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(2);
    const onion = dto.items.find((item) => item.productId === PRODUCT_ID);
    const carrot = dto.items.find((item) => item.productId === 'product-2');
    // 既存の玉ねぎは bought のまま不変
    expect(onion?.status).toBe('bought');
    // 新規の人参が from_meal_plan で追加される
    expect(carrot?.displayName).toBe('人参');
    expect(carrot?.status).toBe('pending');
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('新規材料が無ければ no-op で保存しない', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(1);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('新規材料に在庫引き算を適用し、Pantry を消費する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'bought' })]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [
        seededPlannedRecipe('planned-1', RECIPE_ID),
        seededPlannedRecipe('planned-2', 'recipe-2'),
      ]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    recipeRepository.seed(
      seededRecipe('recipe-2', [amountIngredient('人参', 3, '個', 'product-2')]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));
    productRepository.seed(seededProduct('product-2'));
    pantryRepository.seedStock(stockInput('product-2', 1, '個', { displayName: '人参' }));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    const carrot = dto.items.find((item) => item.productId === 'product-2');
    // 3個 必要・在庫 1個 → 買う量 2個（可算単位は切り上げ）
    expect(carrot?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(pantryRepository.saveCount).toBe(1);
  });

  it('completed のリストは InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed', [seededItem()]));
    mealPlanRepository.seed(seededMealPlan('cooking', []));

    await expect(
      syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID }),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('MealPlan が draft のときは InvalidMealPlanStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(seededMealPlan('draft', []));

    await expect(
      syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID }),
    ).rejects.toBeInstanceOf(InvalidMealPlanStateError);
  });

  it('ShoppingList が存在しない場合は ShoppingListNotFoundError を投げる', async () => {
    await expect(syncUseCase().execute({ shoppingListId: 'missing-list' })).rejects.toEqual(
      new ShoppingListNotFoundError('missing-list'),
    );
  });

  it('同期でも調味料は追加せず、非調味料の新規材料だけ追加する（要望1）', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'bought' })]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [
        seededPlannedRecipe('planned-1', RECIPE_ID),
        seededPlannedRecipe('planned-2', 'recipe-2'),
      ]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    // 新規材料として調味料（味噌）と非調味料（人参）を含める
    recipeRepository.seed(
      seededRecipe('recipe-2', [
        amountIngredient('人参', 3, '個', 'product-2'),
        amountIngredient('味噌', 50, 'g'),
      ]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));
    productRepository.seed(seededProduct('product-2'));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(2);
    expect(dto.items.some((item) => item.displayName === '人参')).toBe(true);
    expect(dto.items.some((item) => item.displayName === '味噌')).toBe(false);
  });

  it('献立から消えた from_meal_plan かつ pending の品目を削除する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(seededMealPlan('shopping', []));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(0);
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('bought の品目は献立から消えても削除しない', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'bought' })]));
    mealPlanRepository.seed(seededMealPlan('shopping', []));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]?.status).toBe('bought');
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('manually_added の品目は献立から消えても削除しない', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [seededItem({ source: 'manually_added' })]),
    );
    mealPlanRepository.seed(seededMealPlan('shopping', []));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]?.source).toBe('manually_added');
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('amountNote の pending 品目はキーが消えたら削除する', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          displayName: '塩',
          productId: null,
          requiredAmount: null,
          amountNote: '適量',
        }),
      ]),
    );
    mealPlanRepository.seed(seededMealPlan('shopping', []));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(0);
    expect(shoppingListRepository.saveCount).toBe(1);
  });

  it('pending の数量が増えたら上書きする', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID, 2)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items[0]?.requiredAmount).toEqual({ value: 4, unit: '個' });
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('pending の数量が減ったら上書きし Pantry は操作しない', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [seededItem({ requiredAmount: Quantity.of(4, '個') })]),
    );
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items[0]?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(shoppingListRepository.saveCount).toBe(1);
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('bought の数量は献立が増えても変えない', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'bought' })]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID, 2)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items[0]?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(shoppingListRepository.saveCount).toBe(0);
  });

  it('数量増加分だけ Pantry を消費し既存分は再消費しない', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID, 2)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 1, '個'));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    // 既存 2 + 増分 2 のうち在庫 1 → 買う量 3。在庫は 1 だけ減って 0
    expect(dto.items[0]?.requiredAmount).toEqual({ value: 3, unit: '個' });
    expect(pantryRepository.saveCount).toBe(1);
    expect(pantryRepository.current().stocks).toHaveLength(0);
  });

  it('変更が無ければ 2 回目の同期は no-op になる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });
    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(1);
    expect(shoppingListRepository.saveCount).toBe(0);
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('MealPlan が存在しない場合は MealPlanNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem()]));

    await expect(syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID })).rejects.toEqual(
      new MealPlanNotFoundError(MEAL_PLAN_ID),
    );
  });

  it('手動削除した from_meal_plan の pending は再同期で復活する', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));
    mealPlanRepository.seed(
      seededMealPlan('shopping', [seededPlannedRecipe('planned-1', RECIPE_ID)]),
    );
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const dto = await syncUseCase().execute({ shoppingListId: SHOPPING_LIST_ID });

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]?.displayName).toBe('玉ねぎ');
    expect(shoppingListRepository.saveCount).toBe(1);
  });
});
