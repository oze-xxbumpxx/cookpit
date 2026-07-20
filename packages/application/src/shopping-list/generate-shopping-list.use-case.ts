import type { MealPlan } from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { PlannedRecipe } from '@cookpit/domain/src/meal-plan/meal-plan';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import type { Pantry, Stock } from '@cookpit/domain/src/pantry/pantry';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { RecipeRepository } from '@cookpit/domain/src/recipe/recipe.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { StoreId } from '@cookpit/domain/src/shared/store';
import type { Unit } from '@cookpit/domain/src/shared/unit';
import { isCountableUnit } from '@cookpit/domain/src/shared/unit';
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
 * 初回生成（created: true）時は Pantry の在庫を考慮し、productId・単位が一致する在庫分を
 * 必要量から差し引いてから ShoppingItem を生成する。差し引いた分は Pantry から実際に消費し
 * 保存する（副作用）。冪等パス（created: false）では在庫消費を行わない。
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
    private readonly pantryRepository: PantryRepository,
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
    const pantry = await this.pantryRepository.find();
    const { ingredients: afterDeduction, consumed } = this.applyPantryDeduction(aggregated, pantry);
    const targetStoreMap = await this.resolveTargetStores(afterDeduction);

    const items = afterDeduction.map((ingredient) =>
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

    // 集約横断の永続化順序（D-7）: ShoppingList → Pantry → MealPlan。UoW が無いため部分失敗を許容する。
    await this.shoppingListRepository.save(shoppingList);
    if (consumed) {
      await this.pantryRepository.save(pantry);
    }
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

  /**
   * 集約済みの必要量から Pantry の在庫分を差し引き、買う量に調整した食材配列を返す。
   * 差し引いた在庫は `pantry` から消費する（副作用）。productId・単位が一致する在庫のみ対象
   * （P-2 / D-1）。在庫でまかなえた食材は結果から除外する（D-4）。
   *
   * @returns ingredients 買う量に調整済みの食材配列 / consumed 在庫を 1 件でも消費したか
   */
  private applyPantryDeduction(
    aggregated: ResolvedIngredient[],
    pantry: Pantry,
  ): { ingredients: ResolvedIngredient[]; consumed: boolean } {
    const result: ResolvedIngredient[] = [];
    let consumed = false;

    for (const ingredient of aggregated) {
      const required = ingredient.requiredAmount;
      const productId = ingredient.productId;
      if (required === null || productId === null) {
        result.push(ingredient);
        continue;
      }

      const unit = required.unit;
      const matching = pantry.stocks
        .filter(
          (stock) =>
            stock.productId !== null &&
            stock.productId.value === productId.value &&
            stock.amount.unit === unit,
        )
        .sort(compareStockForConsumption);
      const available = matching.reduce((sum, stock) => sum + stock.amount.value, 0);
      if (available === 0) {
        result.push(ingredient);
        continue;
      }

      this.consumeFromStocks(pantry, matching, Math.min(required.value, available), unit);
      consumed = true;

      const buyRaw = required.value - available;
      if (buyRaw <= 0) {
        continue;
      }
      const buy = isCountableUnit(unit) ? Math.ceil(buyRaw) : buyRaw;
      result.push({ ...ingredient, requiredAmount: Quantity.of(buy, unit) });
    }

    return { ingredients: result, consumed };
  }

  private consumeFromStocks(
    pantry: Pantry,
    orderedStocks: Stock[],
    totalToConsume: number,
    unit: Unit,
  ): void {
    let remaining = totalToConsume;
    for (const stock of orderedStocks) {
      if (remaining <= 0) {
        break;
      }
      const portion = Math.min(remaining, stock.amount.value);
      pantry.consumeStock(stock.id, Quantity.of(portion, unit));
      remaining -= portion;
    }
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

/** 在庫消費順（D-3）: 賞味期限の近い順（null は最後）→ 購入日の古い順。 */
function compareStockForConsumption(a: Stock, b: Stock): number {
  const aExpires = a.expiresAt;
  const bExpires = b.expiresAt;
  if (aExpires !== null && bExpires !== null) {
    const diff = aExpires.getTime() - bExpires.getTime();
    if (diff !== 0) {
      return diff;
    }
  } else if (aExpires !== null) {
    return -1;
  } else if (bExpires !== null) {
    return 1;
  }
  return a.purchasedAt.getTime() - b.purchasedAt.getTime();
}
