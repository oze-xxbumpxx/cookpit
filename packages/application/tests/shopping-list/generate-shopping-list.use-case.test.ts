import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidMealPlanStateError } from '../../src/meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../../src/meal-plan/meal-plan-not-found.error';
import { GenerateShoppingListUseCase } from '../../src/shopping-list/generate-shopping-list.use-case';
import { passthroughUnitOfWork } from '../shared/passthrough-unit-of-work';
import {
  MEAL_PLAN_ID,
  RECIPE_ID,
  PRODUCT_ID,
  STORE_ID,
  stockInput,
  seededPlannedRecipe,
  seededMealPlan,
  seededRecipe,
  amountIngredient,
  noteIngredient,
  seededProduct,
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

function generateUseCase(): GenerateShoppingListUseCase {
  return new GenerateShoppingListUseCase(
    mealPlanRepository,
    recipeRepository,
    productRepository,
    shoppingListRepository,
    pantryRepository,
    passthroughUnitOfWork,
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
    recipeRepository.seed(seededRecipe(RECIPE_ID, [amountIngredient('豚肉', 10, 'g')]));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(1);
    expect(result.shoppingList.items[0]?.displayName).toBe('豚肉');
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
        noteIngredient('豚肉', '少々'),
        noteIngredient('豚肉', '適量'),
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
        amountIngredient('豚肉', 10, 'g'),
        amountIngredient('玉ねぎ', 1, '個', PRODUCT_ID),
      ]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID, false));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items.map((item) => item.targetStoreId)).toEqual([null, null]);
  });

  it('在庫なしでは差し引かず全量を生成し Pantry を保存しない（回帰）', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(1);
    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('在庫が必要量以上なら食材を出さず、必要量分だけ在庫を消費する', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 5, '個'));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(0);
    expect(pantryRepository.saveCount).toBe(1);
    const stocks = pantryRepository.current().stocks;
    expect(stocks).toHaveLength(1);
    expect(stocks[0]?.amount.value).toBe(3);
    expect(stocks[0]?.amount.unit).toBe('個');
  });

  it('数えられる単位は端数を切り上げ、在庫は全量消費する', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 0.5, '個'));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    // 必要 2 − 在庫 0.5 = 1.5 → 数えられる単位なので 2 に切り上げ
    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(pantryRepository.current().stocks).toHaveLength(0);
  });

  it('連続量（g）は切り上げず小数のまま差し引く', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('小麦粉', 100, 'g', 'product-flour')]),
    );
    pantryRepository.seedStock(stockInput('product-flour', 30, 'g', { displayName: '小麦粉' }));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 70, unit: 'g' });
    expect(pantryRepository.current().stocks).toHaveLength(0);
  });

  it('単位が一致しない在庫は差し引かず、Pantry も変更しない', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)]),
    );
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 100, 'g'));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 2, unit: '個' });
    expect(pantryRepository.saveCount).toBe(0);
    expect(pantryRepository.current().stocks[0]?.amount.value).toBe(100);
    expect(pantryRepository.current().stocks[0]?.amount.unit).toBe('g');
  });

  it('productId を持たない食材は在庫と突合しない', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(seededRecipe(RECIPE_ID, [amountIngredient('豚肉', 10, 'g')]));
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 100, 'g', { displayName: '豚肉' }));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items[0]?.requiredAmount).toEqual({ value: 10, unit: 'g' });
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('同一 product の複数在庫は賞味期限の近い順に消費する', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [amountIngredient('玉ねぎ', 3, '個', PRODUCT_ID)]),
    );
    // 期限の遠い在庫（残るべき）
    pantryRepository.seedStock(
      stockInput(PRODUCT_ID, 2, '個', { expiresAt: new Date('2026-08-01') }),
    );
    // 期限の近い在庫（先に消費されるべき）
    pantryRepository.seedStock(
      stockInput(PRODUCT_ID, 2, '個', { expiresAt: new Date('2026-07-15') }),
    );

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    // 必要 3 − 在庫 4 = -1 → 全量まかなえるため食材は出ない。消費は 3 個
    expect(result.shoppingList.items).toHaveLength(0);
    const stocks = pantryRepository.current().stocks;
    // 期限の近い在庫が全量消費されて消え、遠い在庫が 1 個残る
    expect(stocks).toHaveLength(1);
    expect(stocks[0]?.expiresAt?.getTime()).toBe(new Date('2026-08-01').getTime());
    expect(stocks[0]?.amount.value).toBe(1);
    expect(stocks[0]?.amount.unit).toBe('個');
  });

  it('冪等再実行（既存リストあり）では在庫を消費しない', async () => {
    mealPlanRepository.seed(seededMealPlan());
    shoppingListRepository.seed(seededShoppingList());
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 5, '個'));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.created).toBe(false);
    expect(pantryRepository.saveCount).toBe(0);
    expect(pantryRepository.current().stocks[0]?.amount.value).toBe(5);
    expect(pantryRepository.current().stocks[0]?.amount.unit).toBe('個');
  });

  it('数値でない量（少々）の食材は在庫と突合しない', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(seededRecipe(RECIPE_ID, [noteIngredient('豚肉', '少々')]));
    pantryRepository.seedStock(stockInput(PRODUCT_ID, 100, 'g', { displayName: '豚肉' }));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items[0]?.amountNote).toBe('少々');
    expect(pantryRepository.saveCount).toBe(0);
  });

  it('調味料は買い物リストから除外し、非調味料だけを生成する（要望1）', async () => {
    mealPlanRepository.seed(seededMealPlan('draft', [seededPlannedRecipe('planned-1', RECIPE_ID)]));
    recipeRepository.seed(
      seededRecipe(RECIPE_ID, [
        amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID),
        amountIngredient('醤油', 30, 'g'),
        noteIngredient('塩', '少々'),
      ]),
    );
    productRepository.seed(seededProduct(PRODUCT_ID));

    const result = await generateUseCase().execute({ mealPlanId: MEAL_PLAN_ID });

    expect(result.shoppingList.items).toHaveLength(1);
    expect(result.shoppingList.items[0]?.displayName).toBe('玉ねぎ');
  });
});
