import type { MealPlan } from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { PlannedRecipe } from '@cookpit/domain/src/meal-plan/meal-plan';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import type { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { StoreId } from '@cookpit/domain/src/shared/store';
import { ShoppingItem, ShoppingList } from '@cookpit/domain/src/shopping-list/shopping-list';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidMealPlanStateError } from '../meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../meal-plan/meal-plan-not-found.error';
import type {
  GenerateShoppingListInputDto,
  GenerateShoppingListResultDto,
} from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';

interface ResolvedIngredient {
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null;
  amountNote: string | null;
}

/**
 * MealPlan（draft）から買い物リストを生成し、MealPlan を shopping へ遷移させる。
 * 冪等: 既存リストがあれば新規生成せずそれを返す（created: false）。その際 MealPlan が
 * draft のままなら shopping へ遷移させ、部分失敗状態を自己修復する（S-6）。
 *
 * @throws MealPlanNotFoundError mealPlanId の MealPlan が存在しない
 * @throws InvalidMealPlanStateError MealPlan が draft 以外で、かつ既存リストもない
 */
export class GenerateShoppingListUseCase {
  constructor(
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly recipeRepository: RecipeRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
  ) {}

  async execute(input: GenerateShoppingListInputDto): Promise<GenerateShoppingListResultDto> {
    const mealPlanId = MealPlanId.fromString(input.mealPlanId);
    const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(input.mealPlanId);
    }

    const existing = await this.shoppingListRepository.findByMealPlanId(mealPlanId);
    if (existing !== null) {
      if (mealPlan.status === 'draft') {
        mealPlan.transitionTo('shopping');
        await this.mealPlanRepository.save(mealPlan);
      }
      return { shoppingList: toShoppingListDto(existing), created: false };
    }

    if (mealPlan.status !== 'draft') {
      throw new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from');
    }

    const resolved = await this.resolveRecipes(mealPlan);
    const aggregated = this.aggregateIngredients(resolved);
    const targetStoreMap = await this.resolveTargetStores(aggregated);

    const items = aggregated.map((ingredient) =>
      ShoppingItem.create({
        productId: ingredient.productId,
        displayName: ingredient.displayName,
        requiredAmount: ingredient.requiredAmount,
        amountNote: ingredient.amountNote,
        targetStore:
          ingredient.productId === null
            ? null
            : (targetStoreMap.get(ingredient.productId.value) ?? null),
        source: 'from_meal_plan',
      }),
    );

    const shoppingList = ShoppingList.create({
      mealPlanId,
      items,
      shoppingDate: mealPlan.weekOf.startDate(),
    });

    await this.shoppingListRepository.save(shoppingList);
    mealPlan.transitionTo('shopping');
    await this.mealPlanRepository.save(mealPlan);

    return { shoppingList: toShoppingListDto(shoppingList), created: true };
  }

  private async resolveRecipes(
    mealPlan: MealPlan,
  ): Promise<Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>> {
    const uniqueRecipeIds = [
      ...new Set(mealPlan.plannedRecipes.map((recipe) => recipe.recipeId.value)),
    ];
    const recipes = await Promise.all(
      uniqueRecipeIds.map((id) => this.recipeRepository.findById(RecipeId.fromString(id))),
    );
    const recipeMap = new Map<string, Recipe>();
    uniqueRecipeIds.forEach((id, index) => {
      const recipe = recipes[index];
      if (recipe !== null && recipe !== undefined) {
        recipeMap.set(id, recipe);
      }
    });

    const resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }> = [];
    for (const plannedRecipe of mealPlan.plannedRecipes) {
      const recipe = recipeMap.get(plannedRecipe.recipeId.value);
      if (recipe === undefined) {
        continue;
      }
      resolved.push({ plannedRecipe, recipe });
    }
    return resolved;
  }

  private aggregateIngredients(
    resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>,
  ): ResolvedIngredient[] {
    const aggregated = new Map<
      string,
      { productId: ProductId | null; displayName: string; requiredAmount: Quantity }
    >();
    const individual: ResolvedIngredient[] = [];

    for (const { plannedRecipe, recipe } of resolved) {
      const scaled = recipe.scaleIngredients(plannedRecipe.scaleFactor);
      for (const ingredient of scaled) {
        const productId =
          ingredient.productRef === null ? null : ProductId.fromString(ingredient.productRef.value);

        if (ingredient.amount === null) {
          individual.push({
            productId,
            displayName: ingredient.displayName,
            requiredAmount: null,
            amountNote: ingredient.amountNote,
          });
          continue;
        }

        const key = `${productId === null ? ingredient.displayName.trim() : productId.value}|${ingredient.amount.unit}`;
        const existing = aggregated.get(key);
        if (existing === undefined) {
          aggregated.set(key, {
            productId,
            displayName: ingredient.displayName,
            requiredAmount: ingredient.amount,
          });
        } else {
          aggregated.set(key, {
            ...existing,
            requiredAmount: existing.requiredAmount.add(ingredient.amount),
          });
        }
      }
    }

    const aggregatedResult: ResolvedIngredient[] = [...aggregated.values()].map((ingredient) => ({
      ...ingredient,
      amountNote: null,
    }));
    return [...aggregatedResult, ...individual];
  }

  private async resolveTargetStores(
    ingredients: ResolvedIngredient[],
  ): Promise<Map<string, StoreId | null>> {
    const uniqueProductIds = [
      ...new Set(
        ingredients
          .map((ingredient) => ingredient.productId)
          .filter((productId): productId is ProductId => productId !== null)
          .map((productId) => productId.value),
      ),
    ];
    const products = await Promise.all(
      uniqueProductIds.map((id) => this.productRepository.findById(ProductId.fromString(id))),
    );

    const storeMap = new Map<string, StoreId | null>();
    uniqueProductIds.forEach((id, index) => {
      storeMap.set(id, products[index]?.cheapestStoreAt(new Date()) ?? null);
    });
    return storeMap;
  }
}
